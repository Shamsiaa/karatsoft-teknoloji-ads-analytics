const {
  syncAppleAdsForDate,
  syncGoogleAdsForDate,
} = require("../services/adsReport.service");
const { syncStoreRevenueForDate } = require("../services/storeRevenueSync.service");
const { syncExchangeRateForDate } = require("../services/exchangeRates.service");

let schedulerTimeout = null;
let isSyncRunning = false;
let isEnabled = false;
let nextRunAt = null;
let lastRunStartedAt = null;
let lastRunCompletedAt = null;
let lastRunResult = null;
let backfillStatus = {
  enabled: false,
  isRunning: false,
  startDate: null,
  endDate: null,
  currentDate: null,
  processedDays: 0,
  lastRunStartedAt: null,
  lastRunCompletedAt: null,
  lastRunResult: null,
};

function getYesterdayUtcDate() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function getTodayUtcDate() {
  return new Date().toISOString().slice(0, 10);
}

function parseTime(timeValue) {
  const raw = String(timeValue || "02:00").trim();
  const match = raw.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!match) {
    throw new Error(
      `Invalid DAILY_SYNC_TIME_UTC value "${raw}". Expected HH:mm (UTC).`,
    );
  }
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

function getNextRunAtUtc(hour, minute) {
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(hour, minute, 0, 0);

  if (next <= now) {
    next.setUTCDate(next.getUTCDate() + 1);
  }

  return next;
}

function isEnabledFlag(name, fallback = "false") {
  const raw = String(process.env[name] ?? fallback).toLowerCase();
  return raw === "true" || raw === "1";
}

function* iterateDatesDesc(startDate, endDate) {
  const current = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  while (current >= end) {
    yield current.toISOString().slice(0, 10);
    current.setUTCDate(current.getUTCDate() - 1);
  }
}

async function runSourcesForDate(
  date,
  {
    includeStoreRevenue = true,
    includeExchangeRates = true,
    exchangeTargetCurrency = "USD",
  } = {},
) {
  const results = [];

  try {
    const appleResult = await syncAppleAdsForDate(date);
    results.push({ source: "apple", success: true, ...appleResult });
  } catch (error) {
    results.push({
      source: "apple",
      success: false,
      error: error.message,
    });
  }

  try {
    const googleResult = await syncGoogleAdsForDate(date);
    results.push({ source: "google", success: true, ...googleResult });
  } catch (error) {
    results.push({
      source: "google",
      success: false,
      error: error.message,
    });
  }

  if (includeStoreRevenue) {
    try {
      const storeResult = await syncStoreRevenueForDate(date);
      results.push(storeResult);
    } catch (error) {
      results.push({
        source: "store_revenue",
        success: false,
        error: error.message,
      });
    }
  }

  if (includeExchangeRates) {
    try {
      const fxResult = await syncExchangeRateForDate(date, exchangeTargetCurrency);
      results.push({ source: "exchange_rates", success: true, ...fxResult });
    } catch (error) {
      results.push({
        source: "exchange_rates",
        success: false,
        error: error.message,
      });
    }
  }

  console.log("[backfill-day]", JSON.stringify({ date, results }));

  return results;
}

async function runDailySync(date = getYesterdayUtcDate()) {
  if (isSyncRunning) {
    return { skipped: true, reason: "sync_already_running", date };
  }

  isSyncRunning = true;
  lastRunStartedAt = new Date().toISOString();
  const includeStoreRevenue = isEnabledFlag("DAILY_STORE_REVENUE_SYNC_ENABLED", "false");
  const includeExchangeRates = isEnabledFlag("DAILY_EXCHANGE_RATE_SYNC_ENABLED", "true");
  const exchangeTargetCurrency = String(process.env.EXCHANGE_RATE_TARGET_CURRENCY || "USD").toUpperCase();

  try {
    const results = await runSourcesForDate(date, {
      includeStoreRevenue,
      includeExchangeRates,
      exchangeTargetCurrency,
    });

    const result = { skipped: false, date, results };
    lastRunResult = result;
    return result;
  } catch (error) {
    lastRunResult = {
      skipped: false,
      date,
      error: error.message,
    };
    throw error;
  } finally {
    lastRunCompletedAt = new Date().toISOString();
    isSyncRunning = false;
  }
}

async function runHistoricalBackfill() {
  if (backfillStatus.isRunning) {
    return { skipped: true, reason: "backfill_already_running" };
  }

  const enabled = isEnabledFlag("HISTORICAL_BACKFILL_ENABLED", "false");
  backfillStatus.enabled = enabled;
  if (!enabled) {
    return { skipped: true, reason: "HISTORICAL_BACKFILL_ENABLED=false" };
  }

  const endDate = process.env.HISTORICAL_BACKFILL_END_DATE || "2025-01-01";
  const startDate = process.env.HISTORICAL_BACKFILL_START_DATE || getTodayUtcDate();
  const includeStoreRevenue = isEnabledFlag("HISTORICAL_BACKFILL_INCLUDE_STORE_REVENUE", "true");
  const includeExchangeRates = isEnabledFlag("HISTORICAL_BACKFILL_INCLUDE_EXCHANGE_RATES", "true");
  const exchangeTargetCurrency = String(process.env.EXCHANGE_RATE_TARGET_CURRENCY || "USD").toUpperCase();
  const maxDays = Number(process.env.HISTORICAL_BACKFILL_MAX_DAYS || 5000);

  if (startDate < endDate) {
    throw new Error("HISTORICAL_BACKFILL_START_DATE must be >= HISTORICAL_BACKFILL_END_DATE");
  }

  backfillStatus = {
    ...backfillStatus,
    enabled,
    isRunning: true,
    startDate,
    endDate,
    currentDate: startDate,
    processedDays: 0,
    lastRunStartedAt: new Date().toISOString(),
    lastRunCompletedAt: null,
    lastRunResult: null,
  };

  const dailyResults = [];
  try {
    let count = 0;
    for (const date of iterateDatesDesc(startDate, endDate)) {
      if (count >= maxDays) break;
      backfillStatus.currentDate = date;
      const results = await runSourcesForDate(date, {
        includeStoreRevenue,
        includeExchangeRates,
        exchangeTargetCurrency,
      });
      dailyResults.push({ date, results });
      count += 1;
      backfillStatus.processedDays = count;
    }

    const result = {
      skipped: false,
      startDate,
      endDate,
      processedDays: backfillStatus.processedDays,
      includeStoreRevenue,
      includeExchangeRates,
      exchangeTargetCurrency,
      results: dailyResults,
    };
    backfillStatus.lastRunResult = result;
    return result;
  } finally {
    backfillStatus.isRunning = false;
    backfillStatus.currentDate = null;
    backfillStatus.lastRunCompletedAt = new Date().toISOString();
  }
}

function scheduleNextRun() {
  const { hour, minute } = parseTime(process.env.DAILY_SYNC_TIME_UTC || "02:00");
  const nextRun = getNextRunAtUtc(hour, minute);
  nextRunAt = nextRun.toISOString();
  const waitMs = nextRun.getTime() - Date.now();

  schedulerTimeout = setTimeout(async () => {
    try {
      const date = getYesterdayUtcDate();
      const result = await runDailySync(date);
      console.log("[daily-sync] run completed:", JSON.stringify(result));
    } catch (error) {
      console.error("[daily-sync] run failed:", error.message);
    }
    scheduleNextRun();
  }, waitMs);

  console.log(
    `[daily-sync] next run scheduled at ${nextRun.toISOString()} (UTC)`,
  );
}

function startDailyFetchJob() {
  const enabled = String(process.env.DAILY_SYNC_ENABLED || "true").toLowerCase();
  if (enabled === "false" || enabled === "0") {
    isEnabled = false;
    console.log("[daily-sync] disabled by DAILY_SYNC_ENABLED");
    return;
  }
  isEnabled = true;

  const runOnStartup = String(process.env.DAILY_SYNC_RUN_ON_STARTUP || "false").toLowerCase();
  if (runOnStartup === "true" || runOnStartup === "1") {
    const date = getYesterdayUtcDate();
    runDailySync(date)
      .then((result) => {
        console.log("[daily-sync] startup run completed:", JSON.stringify(result));
      })
      .catch((error) => {
        console.error("[daily-sync] startup run failed:", error.message);
      });
  }

  const backfillRunOnStartup = isEnabledFlag("HISTORICAL_BACKFILL_RUN_ON_STARTUP", "false");
  if (backfillRunOnStartup) {
    runHistoricalBackfill()
      .then((result) => {
        console.log("[backfill] run completed:", JSON.stringify({
          skipped: result.skipped,
          startDate: result.startDate,
          endDate: result.endDate,
          processedDays: result.processedDays,
        }));
      })
      .catch((error) => {
        console.error("[backfill] run failed:", error.message);
      });
  }

  scheduleNextRun();
}

function stopDailyFetchJob() {
  if (schedulerTimeout) {
    clearTimeout(schedulerTimeout);
    schedulerTimeout = null;
  }
  nextRunAt = null;
}

function getDailyFetchStatus() {
  return {
    enabled: isEnabled,
    isSyncRunning,
    nextRunAt,
    lastRunStartedAt,
    lastRunCompletedAt,
    lastRunResult,
    backfill: backfillStatus,
  };
}

module.exports = {
  startDailyFetchJob,
  stopDailyFetchJob,
  runDailySync,
  runHistoricalBackfill,
  getDailyFetchStatus,
};
