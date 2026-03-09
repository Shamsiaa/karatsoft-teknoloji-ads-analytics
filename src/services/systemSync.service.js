const appsRepo = require("../db/apps.repository");
const syncStateRepo = require("../db/syncState.repository");
const { syncAppleAdsForDate, syncGoogleAdsForDate } = require("./adsReport.service");
const { syncAppStoreRevenueForDate } = require("./storeConnectors/appStoreConnect.service");
const { syncGooglePlayRevenueForDate } = require("./storeConnectors/googlePlayReports.service");
const { syncExchangeRateForDate } = require("./exchangeRates.service");
const logger = require("../utils/logger");

function toYmd(date) {
  return date.toISOString().slice(0, 10);
}

function fromYmd(ymd) {
  return new Date(`${ymd}T00:00:00Z`);
}

function shiftDate(ymd, days) {
  const d = fromYmd(ymd);
  d.setUTCDate(d.getUTCDate() + days);
  return toYmd(d);
}

function nowUtcDate() {
  return toYmd(new Date());
}

function getSyncConfig() {
  return {
    backfillChunkDays: Number(process.env.SYNC_ALL_BACKFILL_CHUNK_DAYS || 30),
    backfillFloorDate: process.env.SYNC_ALL_BACKFILL_FLOOR_DATE || "2025-01-01",
    delayMs: Number(process.env.SYNC_ALL_DELAY_MS || 750),
    exchangeCurrency: String(process.env.EXCHANGE_RATE_TARGET_CURRENCY || "USD").toUpperCase(),
  };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runWithDelay(fn, delayMs) {
  const result = await fn();
  if (delayMs > 0) await delay(delayMs);
  return result;
}

function buildBackfillDates(cursorDate, floorDate, limit) {
  const out = [];
  let current = cursorDate;
  for (let i = 0; i < limit; i += 1) {
    if (!current || current < floorDate) break;
    out.push(current);
    current = shiftDate(current, -1);
  }
  return out;
}

async function syncDateForAllApps(date, apps, cfg) {
  const dateResult = { date, sources: [] };

  try {
    const apple = await runWithDelay(() => syncAppleAdsForDate(date), cfg.delayMs);
    dateResult.sources.push({ source: "apple_ads", success: true, ...apple });
  } catch (error) {
    dateResult.sources.push({ source: "apple_ads", success: false, error: error.message });
  }

  try {
    const google = await runWithDelay(() => syncGoogleAdsForDate(date), cfg.delayMs);
    dateResult.sources.push({ source: "google_ads", success: true, ...google });
  } catch (error) {
    dateResult.sources.push({ source: "google_ads", success: false, error: error.message });
  }

  const storeResults = [];
  for (const app of apps) {
    const appKey = app.appKey;
    const perApp = { appKey, stores: [] };

    try {
      const appStore = await runWithDelay(() => syncAppStoreRevenueForDate(appKey, date), cfg.delayMs);
      perApp.stores.push({ source: "app_store_revenue", success: true, ...appStore });
    } catch (error) {
      perApp.stores.push({ source: "app_store_revenue", success: false, error: error.message });
    }

    try {
      const play = await runWithDelay(() => syncGooglePlayRevenueForDate(appKey, date), cfg.delayMs);
      perApp.stores.push({ source: "google_play_revenue", success: true, ...play });
    } catch (error) {
      perApp.stores.push({ source: "google_play_revenue", success: false, error: error.message });
    }

    storeResults.push(perApp);
  }
  dateResult.sources.push({ source: "store_revenue", apps: storeResults });

  try {
    const fx = await runWithDelay(() => syncExchangeRateForDate(date, cfg.exchangeCurrency), cfg.delayMs);
    dateResult.sources.push({ source: "exchange_rates", success: true, ...fx });
  } catch (error) {
    dateResult.sources.push({ source: "exchange_rates", success: false, error: error.message });
  }

  return dateResult;
}

async function runSyncAllNow() {
  const lockAcquired = await syncStateRepo.tryAcquireLock();
  if (!lockAcquired) {
    const state = await syncStateRepo.getState();
    return { skipped: true, reason: "already_running", state };
  }

  const cfg = getSyncConfig();
  const today = nowUtcDate();
  const yesterday = shiftDate(today, -1);
  let failureMessage = null;

  try {
    const apps = await appsRepo.listApps();
    const state = await syncStateRepo.getState();
    const cursorDate = state?.cursorDate || shiftDate(yesterday, -1);
    const backfillDates = buildBackfillDates(cursorDate, cfg.backfillFloorDate, cfg.backfillChunkDays);
    const dates = [today, yesterday, ...backfillDates];

    const results = [];
    for (const date of dates) {
      await syncStateRepo.heartbeat();
      const dateResult = await syncDateForAllApps(date, apps, cfg);
      results.push(dateResult);
      await syncStateRepo.setLastSuccessDate(date);
      logger.info("sync.all.date.completed", {
        date,
        appCount: apps.length,
      });
    }

    const nextCursor = backfillDates.length > 0
      ? shiftDate(backfillDates[backfillDates.length - 1], -1)
      : cursorDate;
    await syncStateRepo.setCursorDate(nextCursor >= cfg.backfillFloorDate ? nextCursor : null);

    return {
      skipped: false,
      mode: "sync_all",
      priorityDates: [today, yesterday],
      backfillDates,
      nextBackfillCursorDate: nextCursor >= cfg.backfillFloorDate ? nextCursor : null,
      config: cfg,
      appCount: apps.length,
      results,
    };
  } catch (error) {
    failureMessage = error.message;
    throw error;
  } finally {
    await syncStateRepo.releaseLock({ lastError: failureMessage });
  }
}

module.exports = {
  runSyncAllNow,
};
