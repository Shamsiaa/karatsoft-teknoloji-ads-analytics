const {
  getSpendRevenueComparison,
  getPlatformSpendRevenueComparison,
  getPlatformSpendRevenueComparisonNormalized,
  getPlatformRevenueRawByCurrency,
  getStoreRevenueCoverage,
} = require("../services/revenueReport.service");

function isValidDate(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date);
}

function getExpectedDays(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  const diff = Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1;
  return Math.max(diff, 0);
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

async function getRevenueCoverage(req, res) {
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

    const expectedDays = getExpectedDays(startDate, endDate);
    const coverage = await getStoreRevenueCoverage(startDate, endDate, appKey || null);

    return res.json({
      startDate,
      endDate,
      appKey: appKey || null,
      expectedDays,
      stores: {
        app_store: coverage.stores.app_store
          ? {
              ...coverage.stores.app_store,
              missingDays: Math.max(expectedDays - (coverage.stores.app_store.daysWithData || 0), 0),
            }
          : null,
        google_play: coverage.stores.google_play
          ? {
              ...coverage.stores.google_play,
              missingDays: Math.max(expectedDays - (coverage.stores.google_play.daysWithData || 0), 0),
            }
          : null,
      },
    });
  } catch (error) {
    console.error("Error getting revenue coverage:", error);
    return res.status(500).json({
      error: "Failed to get revenue coverage",
      message: error.message,
    });
  }
}

module.exports = {
  getComparison,
  getPlatformComparison,
  getPlatformComparisonNormalized,
  getPlatformRevenueRaw,
  getRevenueCoverage,
};
