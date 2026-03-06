const express = require("express");
const { getDailyFetchStatus, runHistoricalBackfill } = require("../jobs/dailyFetch.job");
const { syncExchangeRateForDate } = require("../services/exchangeRates.service");
const exchangeRatesRepo = require("../db/exchangeRates.repository");

const router = express.Router();

// GET /api/system/scheduler-status
router.get("/scheduler-status", (req, res) => {
  return res.json(getDailyFetchStatus());
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
