const {
  getSpendRevenueComparison,
  getPlatformSpendRevenueComparison,
  getPlatformSpendRevenueComparisonNormalized,
  getPlatformRevenueRawByCurrency,
} = require("../services/revenueReport.service");

function isValidDate(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date);
}

async function getComparison(req, res) {
  try {
    const { startDate, endDate, appKey } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        error: "startDate and endDate query parameters are required (format: YYYY-MM-DD)",
      });
    }

    if (!isValidDate(startDate) || !isValidDate(endDate)) {
      return res.status(400).json({ error: "Invalid date format. Expected YYYY-MM-DD" });
    }

    const comparison = await getSpendRevenueComparison(startDate, endDate, appKey || null);
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
    const { startDate, endDate, appKey } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        error: "startDate and endDate query parameters are required (format: YYYY-MM-DD)",
      });
    }

    if (!isValidDate(startDate) || !isValidDate(endDate)) {
      return res.status(400).json({ error: "Invalid date format. Expected YYYY-MM-DD" });
    }

    const comparison = await getPlatformSpendRevenueComparison(startDate, endDate, appKey || null);
    return res.json(comparison);
  } catch (error) {
    console.error("Error creating platform spend vs revenue comparison:", error);
    return res.status(500).json({
      error: "Failed to get platform spend vs revenue comparison",
      message: error.message,
    });
  }
}

async function getPlatformComparisonNormalized(req, res) {
  try {
    const { startDate, endDate, appKey, targetCurrency } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        error: "startDate and endDate query parameters are required (format: YYYY-MM-DD)",
      });
    }

    if (!isValidDate(startDate) || !isValidDate(endDate)) {
      return res.status(400).json({ error: "Invalid date format. Expected YYYY-MM-DD" });
    }

    const comparison = await getPlatformSpendRevenueComparisonNormalized(
      startDate,
      endDate,
      appKey || null,
      (targetCurrency || "USD").toUpperCase(),
    );
    return res.json(comparison);
  } catch (error) {
    console.error("Error creating normalized platform spend vs revenue comparison:", error);
    return res.status(500).json({
      error: "Failed to get normalized platform spend vs revenue comparison",
      message: error.message,
    });
  }
}

async function getPlatformRevenueRaw(req, res) {
  try {
    const { startDate, endDate, appKey } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        error: "startDate and endDate query parameters are required (format: YYYY-MM-DD)",
      });
    }

    if (!isValidDate(startDate) || !isValidDate(endDate)) {
      return res.status(400).json({ error: "Invalid date format. Expected YYYY-MM-DD" });
    }

    const data = await getPlatformRevenueRawByCurrency(startDate, endDate, appKey || null);
    return res.json(data);
  } catch (error) {
    console.error("Error getting raw platform revenue by currency:", error);
    return res.status(500).json({
      error: "Failed to get raw platform revenue by currency",
      message: error.message,
    });
  }
}

module.exports = {
  getComparison,
  getPlatformComparison,
  getPlatformComparisonNormalized,
  getPlatformRevenueRaw,
};
