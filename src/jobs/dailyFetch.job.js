const {
  syncAppleAdsForDate,
  syncRevenueCatForDate,
} = require("../services/adsReport.service");

let schedulerTimeout = null;
let isSyncRunning = false;
let isEnabled = false;
let nextRunAt = null;
let lastRunStartedAt = null;
let lastRunCompletedAt = null;
let lastRunResult = null;

function getYesterdayUtcDate() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
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

async function runDailySync(date = getYesterdayUtcDate()) {
  if (isSyncRunning) {
    return { skipped: true, reason: "sync_already_running", date };
  }

  isSyncRunning = true;
  lastRunStartedAt = new Date().toISOString();
  const results = [];

  try {
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
      const revenueResult = await syncRevenueCatForDate(date);
      results.push({ source: "revenuecat", success: true, ...revenueResult });
    } catch (error) {
      results.push({
        source: "revenuecat",
        success: false,
        error: error.message,
      });
    }

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
  };
}

module.exports = {
  startDailyFetchJob,
  stopDailyFetchJob,
  runDailySync,
  getDailyFetchStatus,
};
