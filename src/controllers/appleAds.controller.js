const {
  getCampaignsMetrics,
  getAdGroupsMetrics,
} = require("../services/appleAds/metrics.service");

/**
 * Validate YYYY-MM-DD format
 */
function isValidDate(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date);
}

/**
 * Safely parse integer
 */
function parseNumber(value, defaultValue) {
  const n = Number(value);
  return Number.isFinite(n) ? n : defaultValue;
}

/**
 * Get Apple Ads campaigns report
 */
async function getCampaigns(req, res) {
  try {
    const { startDate, endDate, granularity, limit, offset } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        error:
          "startDate and endDate query parameters are required (format: YYYY-MM-DD)",
      });
    }

    if (!isValidDate(startDate) || !isValidDate(endDate)) {
      return res.status(400).json({
        error: "Invalid date format. Expected format: YYYY-MM-DD",
      });
    }

    const options = {
      ...(granularity && { granularity }),
      limit: parseNumber(limit, 1000),
      offset: parseNumber(offset, 0),
      debug: req.query.debug === "1" || req.query.debug === "true",
    };

    const result = await getCampaignsMetrics(startDate, endDate, options);

    // Support debug: return raw Apple response to verify shape / empty vs parsing
    const metrics = result?.metrics ?? result;
    const response = {
      success: true,
      count: Array.isArray(metrics) ? metrics.length : 0,
      data: Array.isArray(metrics) ? metrics : [],
    };
    if (result?.rawResponse !== undefined) {
      response._raw = result.rawResponse;
    }

    return res.json(response);
  } catch (error) {
    console.error("Error fetching campaigns:", error);

    return res.status(500).json({
      error: "Failed to fetch campaigns metrics",
      message: error.message,
    });
  }
}

/**
 * Get Apple Ads ad groups report
 */
async function getAdGroups(req, res) {
  try {
    const {
      startDate,
      endDate,
      campaignId,
      granularity,
      limit,
      offset,
    } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        error:
          "startDate and endDate query parameters are required (format: YYYY-MM-DD)",
      });
    }

    if (!isValidDate(startDate) || !isValidDate(endDate)) {
      return res.status(400).json({
        error: "Invalid date format. Expected format: YYYY-MM-DD",
      });
    }

    if (!campaignId) {
      return res.status(400).json({
        error:
          "campaignId query parameter is required for ad group-level reports (Apple endpoint is campaign-scoped)",
      });
    }

    const options = {
      campaignId,
      ...(granularity && { granularity }),
      limit: parseNumber(limit, 1000),
      offset: parseNumber(offset, 0),
    };

    const metrics = await getAdGroupsMetrics(startDate, endDate, options);

    return res.json({
      success: true,
      count: metrics.length,
      data: metrics,
    });
  } catch (error) {
    console.error("Error fetching ad groups:", error);

    return res.status(500).json({
      error: "Failed to fetch ad groups metrics",
      message: error.message,
    });
  }
}

module.exports = {
  getCampaigns,
  getAdGroups,
};