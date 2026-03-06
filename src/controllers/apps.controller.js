const appsRepo = require("../db/apps.repository");
const mappingRepo = require("../db/campaignAppMapping.repository");
const storeRevenueRepo = require("../db/storeRevenue.repository");
const { importStoreCsv } = require("../services/storeRevenueCsv.service");
const { syncAppStoreRevenueForDate } = require("../services/storeConnectors/appStoreConnect.service");
const { syncGooglePlayRevenueForDate } = require("../services/storeConnectors/googlePlayReports.service");
const { syncExchangeRateForDate } = require("../services/exchangeRates.service");

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

async function listApps(req, res) {
  try {
    const data = await appsRepo.listApps();
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ error: "Failed to list apps", message: error.message });
  }
}

async function upsertApp(req, res) {
  try {
    const { appKey, appName } = req.body || {};
    if (!appKey || !appName) {
      return res.status(400).json({ error: "appKey and appName are required" });
    }

    await appsRepo.upsertApp(req.body);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: "Failed to upsert app", message: error.message });
  }
}

async function listMappings(req, res) {
  try {
    const data = await mappingRepo.listMappings(req.query.appKey || null);
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ error: "Failed to list campaign mappings", message: error.message });
  }
}

async function upsertMapping(req, res) {
  try {
    const { platform, campaignId, appKey, validFrom, validTo } = req.body || {};
    if (!platform || !campaignId || !appKey) {
      return res.status(400).json({ error: "platform, campaignId and appKey are required" });
    }

    if ((validFrom && !isValidDate(validFrom)) || (validTo && !isValidDate(validTo))) {
      return res.status(400).json({ error: "validFrom/validTo must be YYYY-MM-DD" });
    }

    await mappingRepo.upsertMapping({ platform, campaignId, appKey, validFrom, validTo });
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: "Failed to upsert campaign mapping", message: error.message });
  }
}

async function importStoreRevenue(req, res) {
  try {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (rows.length === 0) {
      return res.status(400).json({ error: "rows[] is required and must be non-empty" });
    }

    for (const row of rows) {
      const { appKey, store, metricDate } = row;
      if (!appKey || !store || !metricDate) {
        return res.status(400).json({
          error: "Each row must include appKey, store, metricDate",
        });
      }
      if (!["app_store", "google_play"].includes(store)) {
        return res.status(400).json({ error: "store must be app_store or google_play" });
      }
      if (!isValidDate(metricDate)) {
        return res.status(400).json({ error: "metricDate must be YYYY-MM-DD" });
      }
    }

    for (const row of rows) {
      await storeRevenueRepo.upsertStoreRevenueMetric(row);
    }

    return res.json({ success: true, imported: rows.length });
  } catch (error) {
    return res.status(500).json({ error: "Failed to import store revenue", message: error.message });
  }
}

async function importAppStoreCsv(req, res) {
  try {
    const { appKey, csvText, currency } = req.body || {};
    if (!appKey || !csvText) {
      return res.status(400).json({ error: "appKey and csvText are required" });
    }

    const result = await importStoreCsv(
      appKey,
      csvText,
      "app_store",
      currency || "USD",
      "app_store_csv",
    );
    return res.json({ success: true, ...result });
  } catch (error) {
    return res.status(500).json({ error: "Failed to import App Store CSV", message: error.message });
  }
}

async function importGooglePlayCsv(req, res) {
  try {
    const { appKey, csvText, currency } = req.body || {};
    if (!appKey || !csvText) {
      return res.status(400).json({ error: "appKey and csvText are required" });
    }

    const result = await importStoreCsv(
      appKey,
      csvText,
      "google_play",
      currency || "USD",
      "google_play_csv",
    );
    return res.json({ success: true, ...result });
  } catch (error) {
    return res.status(500).json({ error: "Failed to import Google Play CSV", message: error.message });
  }
}

async function syncStoreRevenue(req, res) {
  try {
    const date = req.query.date || req.body?.date;
    const appKey = req.query.appKey || req.body?.appKey;
    const store = (req.query.store || req.body?.store || "all").toLowerCase();
    const syncExchangeRates = String(req.query.syncExchangeRates || req.body?.syncExchangeRates || "true").toLowerCase();
    const fxCurrency = String(req.query.fxCurrency || req.body?.fxCurrency || process.env.EXCHANGE_RATE_TARGET_CURRENCY || "USD").toUpperCase();

    if (!appKey || !date) {
      return res.status(400).json({ error: "appKey and date are required (YYYY-MM-DD)" });
    }
    if (!isValidDate(date)) {
      return res.status(400).json({ error: "date must be YYYY-MM-DD" });
    }

    const app = await appsRepo.getAppByKey(appKey);
    if (!app) {
      return res.status(404).json({ error: `App not found for appKey=${appKey}` });
    }

    const results = [];
    if (store === "app_store" || store === "all") {
      results.push(await syncAppStoreRevenueForDate(appKey, date));
    }
    if (store === "google_play" || store === "all") {
      results.push(await syncGooglePlayRevenueForDate(appKey, date));
    }
    if (syncExchangeRates === "true" || syncExchangeRates === "1") {
      try {
        results.push({
          store: "exchange_rates",
          ...(await syncExchangeRateForDate(date, fxCurrency)),
        });
      } catch (error) {
        results.push({
          store: "exchange_rates",
          success: false,
          error: error.message,
          targetCurrency: fxCurrency,
        });
      }
    }

    return res.json({
      success: true,
      appKey,
      date,
      store,
      syncExchangeRates: syncExchangeRates === "true" || syncExchangeRates === "1",
      fxCurrency,
      results,
    });
  } catch (error) {
    return res.status(500).json({ error: "Failed to sync store revenue", message: error.message });
  }
}

async function syncStoreRevenueRange(req, res) {
  try {
    const startDate = req.query.startDate || req.body?.startDate;
    const endDate = req.query.endDate || req.body?.endDate;
    const appKey = req.query.appKey || req.body?.appKey;
    const store = (req.query.store || req.body?.store || "all").toLowerCase();
    const syncExchangeRates = String(req.query.syncExchangeRates || req.body?.syncExchangeRates || "true").toLowerCase();
    const fxCurrency = String(req.query.fxCurrency || req.body?.fxCurrency || process.env.EXCHANGE_RATE_TARGET_CURRENCY || "USD").toUpperCase();

    if (!appKey || !startDate || !endDate) {
      return res.status(400).json({ error: "appKey, startDate and endDate are required (YYYY-MM-DD)" });
    }
    if (!isValidDate(startDate) || !isValidDate(endDate)) {
      return res.status(400).json({ error: "startDate/endDate must be YYYY-MM-DD" });
    }

    const app = await appsRepo.getAppByKey(appKey);
    if (!app) {
      return res.status(404).json({ error: `App not found for appKey=${appKey}` });
    }

    const dates = [...iterateDates(startDate, endDate)];
    if (dates.length > 62) {
      return res.status(400).json({ error: "Maximum sync window is 62 days per request" });
    }

    const results = [];
    for (const date of dates) {
      const dayResult = {
        date,
        stores: [],
      };

      if (store === "app_store" || store === "all") {
        try {
          dayResult.stores.push(await syncAppStoreRevenueForDate(appKey, date));
        } catch (error) {
          dayResult.stores.push({
            appKey,
            date,
            store: "app_store",
            success: false,
            error: error.message,
          });
        }
      }

      if (store === "google_play" || store === "all") {
        try {
          dayResult.stores.push(await syncGooglePlayRevenueForDate(appKey, date));
        } catch (error) {
          dayResult.stores.push({
            appKey,
            date,
            store: "google_play",
            success: false,
            error: error.message,
          });
        }
      }

      if (syncExchangeRates === "true" || syncExchangeRates === "1") {
        try {
          dayResult.stores.push({
            store: "exchange_rates",
            ...(await syncExchangeRateForDate(date, fxCurrency)),
          });
        } catch (error) {
          dayResult.stores.push({
            store: "exchange_rates",
            success: false,
            error: error.message,
            targetCurrency: fxCurrency,
          });
        }
      }

      results.push(dayResult);
    }

    return res.json({
      success: true,
      appKey,
      startDate,
      endDate,
      store,
      syncExchangeRates: syncExchangeRates === "true" || syncExchangeRates === "1",
      fxCurrency,
      syncedDays: dates.length,
      results,
    });
  } catch (error) {
    return res.status(500).json({ error: "Failed to sync store revenue range", message: error.message });
  }
}

async function listStoreRevenueLines(req, res) {
  try {
    const { appKey, store, startDate, endDate, limit } = req.query;
    if (!appKey) {
      return res.status(400).json({ error: "appKey is required" });
    }
    if (store && !["app_store", "google_play"].includes(store)) {
      return res.status(400).json({ error: "store must be app_store or google_play" });
    }
    if ((startDate && !isValidDate(startDate)) || (endDate && !isValidDate(endDate))) {
      return res.status(400).json({ error: "startDate/endDate must be YYYY-MM-DD" });
    }

    const rows = await storeRevenueRepo.listStoreRevenueLines({
      appKey,
      store: store || null,
      startDate: startDate || null,
      endDate: endDate || null,
      limit: limit || 200,
    });

    return res.json({
      appKey,
      store: store || null,
      startDate: startDate || null,
      endDate: endDate || null,
      count: rows.length,
      rows,
    });
  } catch (error) {
    return res.status(500).json({ error: "Failed to list store revenue lines", message: error.message });
  }
}

module.exports = {
  listApps,
  upsertApp,
  listMappings,
  upsertMapping,
  importStoreRevenue,
  importAppStoreCsv,
  importGooglePlayCsv,
  syncStoreRevenue,
  syncStoreRevenueRange,
  listStoreRevenueLines,
};
