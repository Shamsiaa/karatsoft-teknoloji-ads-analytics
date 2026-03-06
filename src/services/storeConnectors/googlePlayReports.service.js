const https = require("https");
const zlib = require("zlib");
const { google } = require("googleapis");
const { importStoreCsv } = require("../storeRevenueCsv.service");
const logger = require("../../utils/logger");
const appsRepo = require("../../db/apps.repository");

function getRequiredEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

async function getAccessToken() {
  const keyFile = getRequiredEnv("GOOGLE_PLAY_SERVICE_ACCOUNT_KEY_PATH");
  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ["https://www.googleapis.com/auth/devstorage.read_only"],
  });
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  const token = tokenResponse?.token || tokenResponse;
  if (!token) throw new Error("Failed to get Google access token");
  return token;
}

function requestJson(url, token) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request(
      {
        method: "GET",
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        path: `${parsed.pathname}${parsed.search}`,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => {
          data += c;
        });
        res.on("end", () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(new Error(`GCS list failed (${res.statusCode}): ${data.slice(0, 500)}`));
          }
          try {
            return resolve(JSON.parse(data || "{}"));
          } catch (err) {
            return reject(new Error(`Failed parsing GCS JSON response: ${err.message}`));
          }
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

function requestText(url, token) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request(
      {
        method: "GET",
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        path: `${parsed.pathname}${parsed.search}`,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "text/plain",
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => {
          data += c;
        });
        res.on("end", () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(new Error(`GCS download failed (${res.statusCode}): ${data.slice(0, 500)}`));
          }
          return resolve(data);
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

function requestBuffer(url, token) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request(
      {
        method: "GET",
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        path: `${parsed.pathname}${parsed.search}`,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/octet-stream",
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => {
          chunks.push(c);
        });
        res.on("end", () => {
          const data = Buffer.concat(chunks);
          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(new Error(`GCS download failed (${res.statusCode}): ${data.toString("utf8").slice(0, 500)}`));
          }
          return resolve(data);
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

function findEocdOffset(buffer) {
  // EOCD (end of central directory) signature appears in the last ~66KB of a standard ZIP.
  const min = Math.max(0, buffer.length - 66000);
  for (let i = buffer.length - 22; i >= min; i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) return i;
  }
  return -1;
}

function readCentralDirectoryEntries(buffer) {
  const eocdOffset = findEocdOffset(buffer);
  if (eocdOffset < 0) throw new Error("Invalid zip: EOCD not found");

  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirSize = buffer.readUInt32LE(eocdOffset + 12);
  const centralDirOffset = buffer.readUInt32LE(eocdOffset + 16);
  if (centralDirOffset + centralDirSize > buffer.length) {
    throw new Error("Invalid zip: central directory out of bounds");
  }

  const entries = [];
  let p = centralDirOffset;
  for (let i = 0; i < totalEntries; i += 1) {
    if (p + 46 > buffer.length || buffer.readUInt32LE(p) !== 0x02014b50) {
      throw new Error("Invalid zip: bad central directory entry");
    }
    const compressionMethod = buffer.readUInt16LE(p + 10);
    const compressedSize = buffer.readUInt32LE(p + 20);
    const fileNameLength = buffer.readUInt16LE(p + 28);
    const extraLength = buffer.readUInt16LE(p + 30);
    const commentLength = buffer.readUInt16LE(p + 32);
    const localHeaderOffset = buffer.readUInt32LE(p + 42);

    if (compressedSize === 0xffffffff || localHeaderOffset === 0xffffffff) {
      throw new Error("Zip64 format is not supported yet");
    }

    const nameStart = p + 46;
    const nameEnd = nameStart + fileNameLength;
    const fileName = buffer.slice(nameStart, nameEnd).toString("utf8");

    entries.push({
      fileName,
      compressionMethod,
      compressedSize,
      localHeaderOffset,
    });

    p = nameEnd + extraLength + commentLength;
  }
  return entries;
}

function getEntryCompressedData(buffer, entry) {
  const p = entry.localHeaderOffset;
  if (p + 30 > buffer.length || buffer.readUInt32LE(p) !== 0x04034b50) {
    throw new Error(`Invalid zip: local header not found for ${entry.fileName}`);
  }
  const fileNameLength = buffer.readUInt16LE(p + 26);
  const extraLength = buffer.readUInt16LE(p + 28);
  const dataStart = p + 30 + fileNameLength + extraLength;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataEnd > buffer.length) {
    throw new Error(`Invalid zip: data out of bounds for ${entry.fileName}`);
  }
  return buffer.slice(dataStart, dataEnd);
}

function unzipFirstCsv(buffer) {
  const entries = readCentralDirectoryEntries(buffer);
  const csvEntry =
    entries.find((e) => /(^|\/)PlayApps_\d{6}\.csv$/i.test(e.fileName)) ||
    entries.find((e) => e.fileName.toLowerCase().endsWith(".csv"));

  if (!csvEntry) throw new Error("No CSV file found in zip");

  const compressedData = getEntryCompressedData(buffer, csvEntry);
  if (csvEntry.compressionMethod === 0) {
    return { csvText: compressedData.toString("utf8"), zipEntryName: csvEntry.fileName };
  }
  if (csvEntry.compressionMethod === 8) {
    return { csvText: zlib.inflateRawSync(compressedData).toString("utf8"), zipEntryName: csvEntry.fileName };
  }
  throw new Error(`Unsupported zip compression method: ${csvEntry.compressionMethod}`);
}

async function downloadLatestPlayReport(date, opts = {}) {
  const bucket = getRequiredEnv("GOOGLE_PLAY_REPORTS_BUCKET");
  const prefixBase = process.env.GOOGLE_PLAY_REPORTS_PREFIX || "earnings/";
  const dateHint = date.replace(/-/g, "");
  const monthHint = dateHint.slice(0, 6);
  const token = await getAccessToken();

  const listUrl = new URL(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o`);
  listUrl.searchParams.set("prefix", prefixBase);

  const list = await requestJson(listUrl.toString(), token);
  const items = Array.isArray(list.items) ? list.items : [];
  logger.info("google_play_reports.listed", {
    bucket,
    prefix: prefixBase,
    totalObjects: items.length,
    date,
  });

  const reportItems = items.filter((i) => {
    const name = i?.name || "";
    const isReportFile = name.endsWith(".csv") || name.endsWith(".zip");
    if (!isReportFile) return false;
    if (prefixBase) return true;
    return name.includes("earnings");
  });

  let candidates = reportItems.filter((i) => i.name.includes(dateHint) || i.name.includes(date));
  if (candidates.length === 0) {
    candidates = reportItems.filter((i) => i.name.includes(monthHint));
  }

  if (candidates.length === 0) {
    throw new Error(
      `No Google Play report file found for date ${date} (or month ${monthHint}) under prefix "${prefixBase}"`,
    );
  }

  candidates.sort((a, b) => String(b.updated || "").localeCompare(String(a.updated || "")));
  candidates.sort((a, b) => {
    const aEarn = (a.name || "").includes("earnings") ? 1 : 0;
    const bEarn = (b.name || "").includes("earnings") ? 1 : 0;
    return bEarn - aEarn;
  });
  const objectName = candidates[0].name;
  logger.info("google_play_reports.selected_object", {
    date,
    objectName,
    candidateCount: candidates.length,
  });

  const mediaUrl = new URL(
    `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(objectName)}`,
  );
  mediaUrl.searchParams.set("alt", "media");
  let csvText;
  let zipEntryName = null;
  if (objectName.endsWith(".zip")) {
    const zipBuffer = await requestBuffer(mediaUrl.toString(), token);
    const unzipped = unzipFirstCsv(zipBuffer);
    csvText = unzipped.csvText;
    zipEntryName = unzipped.zipEntryName;
    logger.info("google_play_reports.zip_entry_selected", {
      objectName,
      zipEntryName,
    });
  } else {
    csvText = await requestText(mediaUrl.toString(), token);
  }
  return { objectName, csvText, zipEntryName };
}

async function syncGooglePlayRevenueForDate(appKey, date) {
  const app = await appsRepo.getAppByKey(appKey);
  const packageName = app?.androidPackageName || null;
  const { objectName, csvText, zipEntryName } = await downloadLatestPlayReport(date, { packageName });
  const result = await importStoreCsv(
    appKey,
    csvText,
    "google_play",
    "USD",
    "google_play_report_api",
    { packageName, targetDate: date },
  );
  logger.info("google_play_reports.imported", {
    appKey,
    date,
    packageName,
    objectName,
    zipEntryName,
    imported: result.imported,
    skipped: result.skipped,
  });
  return {
    appKey,
    date,
    store: "google_play",
    objectName,
    ...result,
  };
}

module.exports = {
  syncGooglePlayRevenueForDate,
};
