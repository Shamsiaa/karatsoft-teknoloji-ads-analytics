const express = require("express");
const router = express.Router();
const {
  getComparison,
  getPlatformComparison,
  getPlatformComparisonNormalized,
  getPlatformRevenueRaw,
  getPlatformRevenueDaily,
  getRevenueCoverage,
} = require("../controllers/revenueReport.controller");

// GET /api/revenue-report/compare?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD[&appKey=...]
router.get("/compare", getComparison);

// GET /api/revenue-report/platform-compare?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD[&appKey=...]
router.get("/platform-compare", getPlatformComparison);

// GET /api/revenue-report/platform-compare-normalized?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD[&appKey=...&targetCurrency=USD]
router.get("/platform-compare-normalized", getPlatformComparisonNormalized);

// GET /api/revenue-report/platform-revenue-raw?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD[&appKey=...]
router.get("/platform-revenue-raw", getPlatformRevenueRaw);

// GET /api/revenue-report/platform-revenue-daily?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD[&appKey=...]
router.get("/platform-revenue-daily", getPlatformRevenueDaily);

// GET /api/revenue-report/coverage?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD[&appKey=...]
router.get("/coverage", getRevenueCoverage);

module.exports = router;
