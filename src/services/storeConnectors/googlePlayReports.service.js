const https = require("https");
const { google } = require("googleapis");
const { importStoreCsv } = require("../storeRevenueCsv.service");

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

async function downloadLatestPlayReport(date) {
  const bucket = getRequiredEnv("GOOGLE_PLAY_REPORTS_BUCKET");
  const prefixBase = process.env.GOOGLE_PLAY_REPORTS_PREFIX || "";
  const dateHint = date.replace(/-/g, "");
  const token = await getAccessToken();

  const listUrl = new URL(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o`);
  listUrl.searchParams.set("prefix", prefixBase);

  const list = await requestJson(listUrl.toString(), token);
  const items = Array.isArray(list.items) ? list.items : [];

  const candidates = items
    .filter((i) => i?.name && i.name.endsWith(".csv"))
    .filter((i) => i.name.includes(dateHint) || i.name.includes(date));

  if (candidates.length === 0) {
    throw new Error(`No Google Play report csv found for date ${date} under prefix "${prefixBase}"`);
  }

  candidates.sort((a, b) => String(b.updated || "").localeCompare(String(a.updated || "")));
  const objectName = candidates[0].name;

  const mediaUrl = new URL(
    `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(objectName)}`,
  );
  mediaUrl.searchParams.set("alt", "media");
  const csvText = await requestText(mediaUrl.toString(), token);
  return { objectName, csvText };
}

async function syncGooglePlayRevenueForDate(appKey, date) {
  const { objectName, csvText } = await downloadLatestPlayReport(date);
  const result = await importStoreCsv(appKey, csvText, "google_play", "USD", "google_play_report_api");
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
