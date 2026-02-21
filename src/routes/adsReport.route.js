const express = require("express");
const router = express.Router();
const { getReport, syncReport } = require("../controllers/adsReport.controller");

// GET /api/ads-report?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&platform=apple|google
router.get("/", getReport);

// POST /api/ads-report/sync?date=YYYY-MM-DD  (default: yesterday)
router.post("/sync", syncReport);

module.exports = router;
