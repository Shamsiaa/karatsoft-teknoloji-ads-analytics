const express = require("express");
const { getDailyFetchStatus } = require("../jobs/dailyFetch.job");

const router = express.Router();

// GET /api/system/scheduler-status
router.get("/scheduler-status", (req, res) => {
  return res.json(getDailyFetchStatus());
});

module.exports = router;
