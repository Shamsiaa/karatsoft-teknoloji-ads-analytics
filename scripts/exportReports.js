const fs = require("fs");
const path = require("path");
const { downloadAppStoreReport } = require("../src/services/storeConnectors/appStoreConnect.service");
const { downloadLatestPlayReport } = require("../src/services/storeConnectors/googlePlayReports.service");
const { getCampaignsMetrics } = require("../src/services/appleAds/metrics.service");
const { getGoogleCampaignDailyMetrics, getGoogleCustomerInfo } = require("../src/services/googleAds/api.client");

function getArg(name) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx < 0) return null;
  return process.argv[idx + 1] || null;
}

function isValidDate(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date);
}

function* iterateDates(startDate, endDate) {
  const current = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  while (current <= end) {
    yield current.toISOString().slice(0, 10);
    current.setUTCDate(current.getUTCDate() + 1);
  }
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function splitLine(line, delimiter) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === delimiter && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim());
}

function parseCsv(text) {
  const normalized = String(text || "").replace(/\r/g, "");
  const lines = normalized
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return { headers: [], rows: [] };
  const delimiter = lines[0].includes("\t") ? "\t" : ",";
  const headers = splitLine(lines[0], delimiter);
  const rows = lines.slice(1).map((line) => {
    const parts = splitLine(line, delimiter);
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = parts[idx] ?? "";
    });
    return row;
  });
  return { headers, rows };
}

function writeSampleCsv(outPath, headers, rows) {
  const headerLine = headers.join(",");
  const lines = [headerLine];
  for (const row of rows) {
    lines.push(
      headers.map((h) => {
        const raw = row[h] ?? "";
        const str = String(raw).replace(/"/g, '""');
        return str.includes(",") || str.includes('"') ? `"${str}"` : str;
      }).join(","),
    );
  }
  fs.writeFileSync(outPath, lines.join("\n"), "utf8");
}

async function main() {
  const appKey = getArg("appKey");
  const startDate = getArg("startDate");
  const endDate = getArg("endDate");
  const includeAds = String(getArg("includeAds") || "true").toLowerCase() !== "false";
  if (!appKey || !startDate || !endDate) {
    throw new Error("Usage: node scripts/exportReports.js --appKey photoverse --startDate YYYY-MM-DD --endDate YYYY-MM-DD [--includeAds true|false]");
  }
  if (!isValidDate(startDate) || !isValidDate(endDate)) {
    throw new Error("startDate/endDate must be YYYY-MM-DD");
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "").slice(0, 15);
  const outBase = path.join(process.cwd(), "exports", `${appKey}_${startDate}_${endDate}_${stamp}`);
  const appStoreDir = path.join(outBase, "appstore_sales_trends");
  const googlePlayDir = path.join(outBase, "google_play_financial");
  const appleAdsDir = path.join(outBase, "apple_ads");
  const googleAdsDir = path.join(outBase, "google_ads");
  const samplesDir = path.join(outBase, "samples");
  const financialDir = path.join(outBase, "appstore_financial_reports");
  ensureDir(appStoreDir);
  ensureDir(googlePlayDir);
  ensureDir(appleAdsDir);
  ensureDir(googleAdsDir);
  ensureDir(samplesDir);
  ensureDir(financialDir);

  const appStoreSamples = [];
  const googlePlaySamples = [];
  const appleAdsSamples = [];
  const googleAdsSamples = [];
  let appStoreHeaders = [];
  let googlePlayHeaders = [];
  let appleAdsHeaders = [];
  let googleAdsHeaders = [];

  let googleAdsCurrency = "USD";
  if (includeAds) {
    try {
      const info = await getGoogleCustomerInfo();
      if (info?.currencyCode) googleAdsCurrency = String(info.currencyCode).toUpperCase();
    } catch (err) {
      fs.appendFileSync(path.join(outBase, "errors.log"), `[google_ads] customer info: ${err.message}\n`);
    }
  }

  for (const date of iterateDates(startDate, endDate)) {
    // App Store Sales & Trends
    try {
      const csvText = await downloadAppStoreReport(date);
      const filePath = path.join(appStoreDir, `${date}.csv`);
      fs.writeFileSync(filePath, csvText, "utf8");
      const parsed = parseCsv(csvText);
      if (!appStoreHeaders.length) appStoreHeaders = parsed.headers;
      for (const row of parsed.rows) {
        const currency = row["Currency of Proceeds"] || row["Customer Currency"] || "";
        if (currency && !["USD", "TRY"].includes(String(currency).toUpperCase())) {
          if (appStoreSamples.length < 6) appStoreSamples.push(row);
        }
      }
    } catch (err) {
      fs.appendFileSync(path.join(outBase, "errors.log"), `[${date}] appstore: ${err.message}\n`);
    }

    // Google Play Financial
    try {
      const report = await downloadLatestPlayReport(date);
      const safeName = (report.objectName || `google_play_${date}`).replace(/[\\/:*?"<>|]/g, "_");
      const filePath = path.join(googlePlayDir, `${date}__${safeName}.csv`);
      fs.writeFileSync(filePath, report.csvText, "utf8");
      const parsed = parseCsv(report.csvText);
      if (!googlePlayHeaders.length) googlePlayHeaders = parsed.headers;
      for (const row of parsed.rows) {
        const currency = row["Buyer Currency"] || row["Merchant Currency"] || "";
        if (currency && !["USD", "TRY"].includes(String(currency).toUpperCase())) {
          if (googlePlaySamples.length < 6) googlePlaySamples.push(row);
        }
      }
    } catch (err) {
      fs.appendFileSync(path.join(outBase, "errors.log"), `[${date}] google_play: ${err.message}\n`);
    }

    if (includeAds) {
      // Apple Ads
      try {
        const metrics = await getCampaignsMetrics(date, date, { limit: 1000 });
        const rows = metrics.map((m) => ({
          date: m.date || date,
          platform: "apple",
          campaignId: m.campaignId || "",
          campaignName: m.campaignName || "",
          clicks: m.taps ?? 0,
          impressions: m.impressions ?? 0,
          cost: m.spend ?? 0,
          conversions: m.installs ?? 0,
          currency: process.env.APPLE_ADS_CURRENCY || "USD",
        }));
        const headers = ["date", "platform", "campaignId", "campaignName", "clicks", "impressions", "cost", "conversions", "currency"];
        if (!appleAdsHeaders.length) appleAdsHeaders = headers;
        const filePath = path.join(appleAdsDir, `${date}.csv`);
        writeSampleCsv(filePath, headers, rows);
        for (const row of rows) {
          const currency = row.currency || "";
          if (currency && !["USD", "TRY"].includes(String(currency).toUpperCase())) {
            if (appleAdsSamples.length < 6) appleAdsSamples.push(row);
          }
        }
      } catch (err) {
        fs.appendFileSync(path.join(outBase, "errors.log"), `[${date}] apple_ads: ${err.message}\n`);
      }

      // Google Ads
      try {
        const metrics = await getGoogleCampaignDailyMetrics(date, date);
        const rows = metrics.map((m) => ({
          date: m.date || date,
          platform: "google",
          campaignId: m.campaignId || "",
          campaignName: m.campaignName || "",
          clicks: m.clicks ?? 0,
          impressions: m.impressions ?? 0,
          cost: m.cost ?? 0,
          conversions: m.conversions ?? 0,
          currency: googleAdsCurrency,
        }));
        const headers = ["date", "platform", "campaignId", "campaignName", "clicks", "impressions", "cost", "conversions", "currency"];
        if (!googleAdsHeaders.length) googleAdsHeaders = headers;
        const filePath = path.join(googleAdsDir, `${date}.csv`);
        writeSampleCsv(filePath, headers, rows);
        for (const row of rows) {
          const currency = row.currency || "";
          if (currency && !["USD", "TRY"].includes(String(currency).toUpperCase())) {
            if (googleAdsSamples.length < 6) googleAdsSamples.push(row);
          }
        }
      } catch (err) {
        fs.appendFileSync(path.join(outBase, "errors.log"), `[${date}] google_ads: ${err.message}\n`);
      }
    }
  }

  if (appStoreHeaders.length && appStoreSamples.length) {
    writeSampleCsv(path.join(samplesDir, "appstore_sales_trends_non_usd_try.csv"), appStoreHeaders, appStoreSamples);
  }
  if (googlePlayHeaders.length && googlePlaySamples.length) {
    writeSampleCsv(path.join(samplesDir, "google_play_non_usd_try.csv"), googlePlayHeaders, googlePlaySamples);
  }
  if (appleAdsHeaders.length && appleAdsSamples.length) {
    writeSampleCsv(path.join(samplesDir, "apple_ads_non_usd_try.csv"), appleAdsHeaders, appleAdsSamples);
  }
  if (googleAdsHeaders.length && googleAdsSamples.length) {
    writeSampleCsv(path.join(samplesDir, "google_ads_non_usd_try.csv"), googleAdsHeaders, googleAdsSamples);
  }

  fs.writeFileSync(
    path.join(outBase, "README.txt"),
    [
      "Exports generated by scripts/exportReports.js",
      `App key: ${appKey}`,
      `Date range: ${startDate} - ${endDate}`,
      "",
      "Folders:",
      "- appstore_sales_trends: Daily Sales & Trends CSVs (App Store Connect salesReports API).",
      "- google_play_financial: Google Play financial CSVs (GCS reports).",
      "- apple_ads: Apple Search Ads daily CSV (campaign metrics).",
      "- google_ads: Google Ads daily CSV (campaign metrics).",
      "- appstore_financial_reports: Placeholder. Financial reports are monthly payout files and require manual download.",
      "- samples: 5-6 example rows with non-USD/TRY currencies.",
      "",
      "If financial reports are needed, download the monthly report from App Store Connect and place it under appstore_financial_reports.",
    ].join("\n"),
    "utf8",
  );

  console.log(`Export completed: ${outBase}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
