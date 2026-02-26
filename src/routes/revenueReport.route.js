const express = require("express");
const router = express.Router();
const {
  getRevenue,
  syncRevenue,
  getComparison,
  getPlatformComparison,
} = require("../controllers/revenueReport.controller");

// GET /api/revenue-report?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&appId=...
router.get("/", getRevenue);

// POST /api/revenue-report/sync?date=YYYY-MM-DD
router.post("/sync", syncRevenue);

// GET /api/revenue-report/compare?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
router.get("/compare", getComparison);

// GET /api/revenue-report/platform-compare?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
router.get("/platform-compare", getPlatformComparison);

module.exports = router;
