const {
  getAdsReport,
  getAdsTrend,
  getLiveAdsReport,
  syncAppleAdsForDate,
  syncGoogleAdsForDate,
  syncRevenueCatForDate,
} = require("../services/adsReport.service");

function isValidDate(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date);
}

function* iterateDates(startDate, endDate) {
  const current = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);

  while (current <= end) {
    yield current.toISOString().slice(0, 10);
    current.setUTCDate(current.getUTCDate() + 1);
  }
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
 * GET /api/ads-report/trend?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&platform=apple|google
 * Returns daily totals grouped by metric_date for charting.
 */
async function getTrend(req, res) {
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

    const rows = await getAdsTrend(startDate, endDate, platform || null);
    return res.json(rows);
  } catch (err) {
    console.error("Error in ads-report trend:", err);
    return res.status(500).json({
      error: "Failed to get ads trend",
      message: err.message,
    });
  }
}

/**
 * GET /api/ads-report/live?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&platform=apple|google
 * Fetches report directly from ad APIs (no DB), for consistency checks.
 */
async function getLiveReport(req, res) {
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

    const rows = await getLiveAdsReport(startDate, endDate, platform || null);
    return res.json({
      source: "live_api",
      startDate,
      endDate,
      platform: platform || "all",
      rows,
      notes: [
        "Google Ads date attribution uses account timezone and can update conversions retroactively.",
        "Apple Ads report timezone is controlled by APPLE_ADS_REPORT_TIMEZONE (default UTC).",
      ],
    });
  } catch (err) {
    console.error("Error in ads-report live:", err);
    return res.status(500).json({
      error: "Failed to get live ads report",
      message: err.message,
    });
  }
}

/**
 * POST /api/ads-report/sync?date=YYYY-MM-DD[&platform=apple|google|revenuecat|all]
 * Fetches Apple / Google Ads for the given date and saves to DB. Default date = yesterday.
 */
async function syncReport(req, res) {
  try {
    let date = req.query.date || req.body?.date;
    const startDate = req.query.startDate || req.body?.startDate;
    const endDate = req.query.endDate || req.body?.endDate;
    const platform = (req.query.platform || req.body?.platform || "all").toLowerCase();

    if (!date && !startDate && !endDate) {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - 1);
      date = d.toISOString().slice(0, 10);
    }

    if (date && !isValidDate(date)) {
      return res.status(400).json({
        error: "Invalid date. Use date=YYYY-MM-DD",
      });
    }

    if ((startDate && !endDate) || (!startDate && endDate)) {
      return res.status(400).json({
        error: "startDate and endDate must be provided together",
      });
    }

    if (startDate && endDate && (!isValidDate(startDate) || !isValidDate(endDate))) {
      return res.status(400).json({
        error: "Invalid date format for startDate/endDate. Expected YYYY-MM-DD",
      });
    }

    const dates = date ? [date] : [...iterateDates(startDate, endDate)];
    if (dates.length > 93) {
      return res.status(400).json({
        error: "Maximum sync window is 93 days per request",
      });
    }

    const results = [];

    for (const targetDate of dates) {
      if (platform === "apple" || platform === "all") {
        results.push(await syncAppleAdsForDate(targetDate));
      }

      if (platform === "google" || platform === "all") {
        results.push(await syncGoogleAdsForDate(targetDate));
      }

      if (platform === "revenuecat" || platform === "all") {
        results.push(await syncRevenueCatForDate(targetDate));
      }
    }

    return res.json({
      success: true,
      mode: date ? "single_date" : "date_range",
      date: date || null,
      startDate: startDate || date,
      endDate: endDate || date,
      syncedDays: dates.length,
      platform,
      results,
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
  getTrend,
  getLiveReport,
  syncReport,
};
