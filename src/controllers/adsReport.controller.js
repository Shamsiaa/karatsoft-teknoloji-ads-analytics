const { getAdsReport, syncAppleAdsForDate } = require("../services/adsReport.service");

function isValidDate(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date);
}

/**
 * GET /api/ads-report?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&platform=apple|google
 * Returns normalized report from DB (project spec format).
 */
async function getReport(req, res) {
  try {
    const { startDate, endDate, platform } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        error: "startDate and endDate query parameters are required (format: YYYY-MM-DD)",
      });
    }

    if (!isValidDate(startDate) || !isValidDate(endDate)) {
      return res.status(400).json({
        error: "Invalid date format. Expected YYYY-MM-DD",
      });
    }

    const rows = await getAdsReport(startDate, endDate, platform || null);

    return res.json(rows);
  } catch (err) {
    console.error("Error in ads-report:", err);
    return res.status(500).json({
      error: "Failed to get ads report",
      message: err.message,
    });
  }
}

/**
 * POST /api/ads-report/sync?date=YYYY-MM-DD
 * Fetches Apple Ads for the given date and saves to DB. Default date = yesterday.
 */
async function syncReport(req, res) {
  try {
    let date = req.query.date || req.body?.date;
    if (!date) {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - 1);
      date = d.toISOString().slice(0, 10);
    }

    if (!isValidDate(date)) {
      return res.status(400).json({
        error: "Invalid date. Use date=YYYY-MM-DD",
      });
    }

    const result = await syncAppleAdsForDate(date);

    return res.json({
      success: true,
      message: `Synced Apple Ads for ${date}`,
      ...result,
    });
  } catch (err) {
    console.error("Error syncing ads report:", err);
    return res.status(500).json({
      error: "Failed to sync ads report",
      message: err.message,
    });
  }
}

module.exports = {
  getReport,
  syncReport,
};
