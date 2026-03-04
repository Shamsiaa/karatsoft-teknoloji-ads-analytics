const appsRepo = require("../db/apps.repository");
const { syncAppStoreRevenueForDate } = require("./storeConnectors/appStoreConnect.service");
const { syncGooglePlayRevenueForDate } = require("./storeConnectors/googlePlayReports.service");

function parseCsvEnv(name) {
  const raw = process.env[name];
  if (!raw) return [];
  return raw
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

async function syncStoreRevenueForDate(date) {
  const appKeys = parseCsvEnv("STORE_REVENUE_SYNC_APP_KEYS");
  if (appKeys.length === 0) {
    return {
      source: "store_revenue",
      success: true,
      skipped: true,
      reason: "STORE_REVENUE_SYNC_APP_KEYS is empty",
      date,
    };
  }

  const perAppResults = [];

  for (const appKey of appKeys) {
    const app = await appsRepo.getAppByKey(appKey);
    if (!app) {
      perAppResults.push({ appKey, success: false, error: "app_not_found" });
      continue;
    }

    const stores = [];
    try {
      stores.push(await syncAppStoreRevenueForDate(appKey, date));
    } catch (error) {
      stores.push({ store: "app_store", success: false, error: error.message });
    }

    try {
      stores.push(await syncGooglePlayRevenueForDate(appKey, date));
    } catch (error) {
      stores.push({ store: "google_play", success: false, error: error.message });
    }

    perAppResults.push({
      appKey,
      success: true,
      stores,
    });
  }

  return {
    source: "store_revenue",
    success: true,
    date,
    apps: perAppResults,
  };
}

module.exports = {
  syncStoreRevenueForDate,
};
