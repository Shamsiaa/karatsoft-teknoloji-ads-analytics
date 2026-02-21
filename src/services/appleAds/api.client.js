const https = require("https");
const { getAppleAdsAccessToken } = require("./oauth.service");

const APPLE_ADS_API_BASE_URL = "https://api.searchads.apple.com/api/v5";

/**
 * Make a request to Apple Ads API
 * @param {string} endpoint - API endpoint (e.g., '/reports/campaigns')
 * @param {object} options - Request options (method, body, query params)
 * @returns {Promise<object>} API response
 */
async function callAppleAdsAPI(endpoint, options = {}) {
  const { method = "GET", body, queryParams } = options;

  try {
    // Exchange JWT client_secret for OAuth access token
    const accessToken = await getAppleAdsAccessToken();
    const orgId = process.env.APPLE_ADS_ORG_ID;

    // Build URL with query params
    let url = `${APPLE_ADS_API_BASE_URL}${endpoint}`;
    if (queryParams && Object.keys(queryParams).length > 0) {
      const params = new URLSearchParams(queryParams);
      url += `?${params.toString()}`;
    }

    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const headers = {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      };

      // Apple Search Ads often requires org context for reporting endpoints
      if (orgId) {
        headers["X-AP-Context"] = `orgId=${orgId}`;
      }

      const requestOptions = {
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        method: method,
        headers,
      };

      const req = https.request(requestOptions, (res) => {
        let data = "";

        res.on("data", (chunk) => {
          data += chunk;
        });

        res.on("end", () => {
          try {
            const parsedData = JSON.parse(data);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(parsedData);
            } else {
              reject(
                new Error(
                  `Apple Ads API error: ${res.statusCode} - ${JSON.stringify(parsedData)}`
                )
              );
            }
          } catch (parseError) {
            reject(new Error(`Failed to parse API response: ${parseError.message}`));
          }
        });
      });

      req.on("error", (error) => {
        reject(new Error(`Apple Ads API request failed: ${error.message}`));
      });

      if (body) {
        req.write(JSON.stringify(body));
      }

      req.end();
    });
  } catch (error) {
    throw new Error(`Apple Ads API call failed: ${error.message}`);
  }
}

/**
 * Get campaigns report
 * @param {object} params - Report parameters (startDate, endDate, etc.)
 * @returns {Promise<object>} Campaigns report data
 */
async function getCampaignsReport(params) {
  return callAppleAdsAPI("/reports/campaigns", {
    method: "POST",
    body: params,
  });
}

/**
 * Get ad groups report
 * NOTE: Apple requires campaignId in the path for ad group-level reports.
 * @param {object} params - Report parameters (startDate, endDate, etc.)
 * @returns {Promise<object>} Ad groups report data
 */
async function getAdGroupsReport(campaignId, params) {
  if (!campaignId) {
    throw new Error("campaignId is required for ad group-level reports");
  }

  return callAppleAdsAPI(`/reports/campaigns/${campaignId}/adgroups`, {
    method: "POST",
    body: params,
  });
}

module.exports = {
  callAppleAdsAPI,
  getCampaignsReport,
  getAdGroupsReport,
};
