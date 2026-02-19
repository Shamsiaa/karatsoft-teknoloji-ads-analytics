const express = require("express");
const router = express.Router();
const metricsRepo = require("../db/metrics.repository");

router.get("/", async (req, res) => {
  try {
    const { start, end } = req.query;

    if (!start || !end) {
      return res
        .status(400)
        .json({ error: "start and end query params required" });
    }

    const data = await metricsRepo.getMetrics(start, end);

    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
