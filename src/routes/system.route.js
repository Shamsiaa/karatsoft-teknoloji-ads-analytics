const express = require("express");
const { getDailyFetchStatus, runHistoricalBackfill } = require("../jobs/dailyFetch.job");
const { syncExchangeRateForDate } = require("../services/exchangeRates.service");
const exchangeRatesRepo = require("../db/exchangeRates.repository");
const { runSyncAllNow } = require("../services/systemSync.service");
const syncStateRepo = require("../db/syncState.repository");
const {
  getGoogleCampaignDailyMetrics,
  getGoogleCustomerInfo,
  googleAdsSearchStream,
} = require("../services/googleAds/api.client");

const router = express.Router();

// GET /api/system/scheduler-status
router.get("/scheduler-status", (req, res) => {
  return res.json(getDailyFetchStatus());
});

// GET /api/system/sync-state
router.get("/sync-state", async (req, res) => {
  try {
    const state = await syncStateRepo.getState();
    return res.json(state);
  } catch (error) {
    return res.status(500).json({
      error: "Failed to get sync state",
      message: error.message,
    });
  }
});

// POST /api/system/backfill/run
router.post("/backfill/run", async (req, res) => {
  try {
    const result = await runHistoricalBackfill();
    return res.json(result);
  } catch (error) {
    return res.status(500).json({
      error: "Failed to run historical backfill",
      message: error.message,
    });
  }
});

function maskValue(value, keep = 4) {
  if (!value) return null;
  const str = String(value);
  if (str.length <= keep) return "*".repeat(str.length);
  return `${"*".repeat(str.length - keep)}${str.slice(-keep)}`;
}

// GET /api/system/google-ads/debug?date=YYYY-MM-DD
router.get("/google-ads/debug", async (req, res) => {
  try {
    const date = req.query.date;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: "date is required (YYYY-MM-DD)" });
    }

    const customer = await getGoogleCustomerInfo();
    const rows = await getGoogleCampaignDailyMetrics(date, date);
    const totals = rows.reduce(
      (acc, r) => {
        acc.clicks += Number(r.clicks) || 0;
        acc.impressions += Number(r.impressions) || 0;
        acc.cost += Number(r.cost) || 0;
        acc.costMicros += Number(r.costMicros) || 0;
        acc.conversions += Number(r.conversions) || 0;
        return acc;
      },
      { clicks: 0, impressions: 0, cost: 0, costMicros: 0, conversions: 0 },
    );

    return res.json({
      date,
      env: {
        customerId: process.env.GOOGLE_ADS_CUSTOMER_ID || null,
        loginCustomerId: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || null,
        developerToken: maskValue(process.env.GOOGLE_ADS_DEVELOPER_TOKEN),
        refreshToken: maskValue(process.env.GOOGLE_ADS_REFRESH_TOKEN, 6),
        clientId: maskValue(process.env.GOOGLE_ADS_CLIENT_ID, 6),
      },
      customer,
      totals,
      sample: rows.slice(0, 3),
      rowCount: rows.length,
    });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to debug Google Ads",
      message: error.message,
    });
  }
});

// GET /api/system/google-ads/debug-cost?date=YYYY-MM-DD
router.get("/google-ads/debug-cost", async (req, res) => {
  try {
    const date = req.query.date;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: "date is required (YYYY-MM-DD)" });
    }

    const queries = {
      customer: `
        SELECT
          segments.date,
          metrics.clicks,
          metrics.impressions,
          metrics.cost_micros,
          metrics.conversions
        FROM customer
        WHERE segments.date = '${date}'
      `,
      campaign: `
        SELECT
          campaign.id,
          campaign.name,
          campaign.status,
          segments.date,
          metrics.clicks,
          metrics.impressions,
          metrics.cost_micros,
          metrics.conversions
        FROM campaign
        WHERE segments.date = '${date}'
      `,
      ad_group: `
        SELECT
          ad_group.id,
          ad_group.name,
          ad_group.status,
          campaign.id,
          campaign.name,
          segments.date,
          metrics.clicks,
          metrics.impressions,
          metrics.cost_micros,
          metrics.conversions
        FROM ad_group
        WHERE segments.date = '${date}'
      `,
    };

    const [customerRows, campaignRows, adGroupRows] = await Promise.all([
      googleAdsSearchStream(queries.customer),
      googleAdsSearchStream(queries.campaign),
      googleAdsSearchStream(queries.ad_group),
    ]);

    function summarize(rows) {
      return rows.reduce(
        (acc, r) => {
          const metrics = r.metrics || {};
          const costMicros = Number(
            metrics.costMicros != null ? metrics.costMicros : metrics.cost_micros || 0,
          );
          acc.rows += 1;
          acc.clicks += Number(metrics.clicks || 0);
          acc.impressions += Number(metrics.impressions || 0);
          acc.costMicros += costMicros;
          acc.conversions += Number(metrics.conversions || 0);
          return acc;
        },
        { rows: 0, clicks: 0, impressions: 0, costMicros: 0, conversions: 0 },
      );
    }

    return res.json({
      date,
      totals: {
        customer: summarize(customerRows),
        campaign: summarize(campaignRows),
        ad_group: summarize(adGroupRows),
      },
      sample: {
        customer: customerRows.slice(0, 3),
        campaign: campaignRows.slice(0, 3),
        ad_group: adGroupRows.slice(0, 3),
      },
    });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to debug Google Ads cost",
      message: error.message,
    });
  }
});

// POST /api/system/exchange-rates/sync?date=YYYY-MM-DD[&currency=USD]
router.post("/exchange-rates/sync", async (req, res) => {
  try {
    const date = req.query.date || req.body?.date;
    const currency = (req.query.currency || req.body?.currency || "USD").toUpperCase();
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: "date is required (YYYY-MM-DD)" });
    }

    const result = await syncExchangeRateForDate(date, currency);
    return res.json({ success: true, ...result });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to sync exchange rate",
      message: error.message,
    });
  }
});

// POST /api/system/sync/all
router.post("/sync/all", async (req, res) => {
  try {
    const result = await runSyncAllNow();
    if (result?.skipped && result?.reason === "already_running") {
      return res.status(409).json(result);
    }
    return res.json(result);
  } catch (error) {
    return res.status(500).json({
      error: "Failed to run sync all",
      message: error.message,
    });
  }
});

// GET /api/system/exchange-rates?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD[&currency=USD]
router.get("/exchange-rates", async (req, res) => {
  try {
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;
    const currency = (req.query.currency || "USD").toUpperCase();
    if (!startDate || !endDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return res.status(400).json({ error: "startDate and endDate are required (YYYY-MM-DD)" });
    }

    const rows = await exchangeRatesRepo.listExchangeRatesByDateRange(currency, startDate, endDate);
    const rates = rows.map((r) => r.exchangeRate);
    const avgRate = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : null;

    return res.json({
      baseCurrency: "TRY",
      currency,
      startDate,
      endDate,
      count: rows.length,
      startRate: rows[0]?.exchangeRate ?? null,
      endRate: rows[rows.length - 1]?.exchangeRate ?? null,
      avgRate,
      rows,
    });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to get exchange rates",
      message: error.message,
    });
  }
});

module.exports = router;
