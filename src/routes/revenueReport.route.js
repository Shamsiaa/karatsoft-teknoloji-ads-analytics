const express = require("express");
const router = express.Router();
const {
  getComparison,
  getPlatformComparison,
  getPlatformComparisonNormalized,
  getPlatformRevenueRaw,
} = require("../controllers/revenueReport.controller");

// GET /api/revenue-report/compare?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD[&appKey=...]
router.get("/compare", getComparison);

// GET /api/revenue-report/platform-compare?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD[&appKey=...]
router.get("/platform-compare", getPlatformComparison);

// GET /api/revenue-report/platform-compare-normalized?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD[&appKey=...&targetCurrency=USD]
router.get("/platform-compare-normalized", getPlatformComparisonNormalized);

// GET /api/revenue-report/platform-revenue-raw?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD[&appKey=...]
router.get("/platform-revenue-raw", getPlatformRevenueRaw);

module.exports = router;
