const {
  syncRevenueForDate,
  getRevenueReport,
  getSpendRevenueComparison,
  getPlatformSpendRevenueComparison,
} = require("../services/revenueReport.service");

function isValidDate(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date);
}

async function getRevenue(req, res) {
  try {
    const { startDate, endDate, appId } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        error: "startDate and endDate query parameters are required (format: YYYY-MM-DD)",
      });
    }

    if (!isValidDate(startDate) || !isValidDate(endDate)) {
      return res.status(400).json({ error: "Invalid date format. Expected YYYY-MM-DD" });
    }

    const rows = await getRevenueReport(startDate, endDate, appId || null);
    return res.json(rows);
  } catch (error) {
    console.error("Error in revenue report:", error);
    return res.status(500).json({ error: "Failed to get revenue report", message: error.message });
  }
}

async function syncRevenue(req, res) {
  try {
    let date = req.query.date || req.body?.date;
    if (!date) {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - 1);
      date = d.toISOString().slice(0, 10);
    }

    if (!isValidDate(date)) {
      return res.status(400).json({ error: "Invalid date. Use date=YYYY-MM-DD" });
    }

    const result = await syncRevenueForDate(date);
    return res.json({ success: true, ...result });
  } catch (error) {
    console.error("Error syncing revenue:", error);
    return res.status(500).json({ error: "Failed to sync revenue", message: error.message });
  }
}

async function getComparison(req, res) {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        error: "startDate and endDate query parameters are required (format: YYYY-MM-DD)",
      });
    }

    if (!isValidDate(startDate) || !isValidDate(endDate)) {
      return res.status(400).json({ error: "Invalid date format. Expected YYYY-MM-DD" });
    }

    const comparison = await getSpendRevenueComparison(startDate, endDate);
    return res.json(comparison);
  } catch (error) {
    console.error("Error creating spend vs revenue comparison:", error);
    return res.status(500).json({
      error: "Failed to get spend vs revenue comparison",
      message: error.message,
    });
  }
}

async function getPlatformComparison(req, res) {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        error: "startDate and endDate query parameters are required (format: YYYY-MM-DD)",
      });
    }

    if (!isValidDate(startDate) || !isValidDate(endDate)) {
      return res.status(400).json({ error: "Invalid date format. Expected YYYY-MM-DD" });
    }

    const comparison = await getPlatformSpendRevenueComparison(startDate, endDate);
    return res.json(comparison);
  } catch (error) {
    console.error("Error creating platform spend vs revenue comparison:", error);
    return res.status(500).json({
      error: "Failed to get platform spend vs revenue comparison",
      message: error.message,
    });
  }
}

module.exports = {
  getRevenue,
  syncRevenue,
  getComparison,
  getPlatformComparison,
};
