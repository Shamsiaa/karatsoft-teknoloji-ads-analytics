const https = require("https");
const { getGoogleAdsAccessToken } = require("./auth.service");

const GOOGLE_ADS_API_VERSION = process.env.GOOGLE_ADS_API_VERSION || "v22";

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

async function googleAdsSearchStream(query) {
  const customerId = getRequiredEnv("GOOGLE_ADS_CUSTOMER_ID").replace(/-/g, "");
  const developerToken = getRequiredEnv("GOOGLE_ADS_DEVELOPER_TOKEN");
  const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID
    ? process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID.replace(/-/g, "")
    : null;

  const accessToken = await getGoogleAdsAccessToken();

  const body = JSON.stringify({ query });

  const url = new URL(
    `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${customerId}/googleAds:searchStream`,
  );

  return new Promise((resolve, reject) => {
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      "developer-token": developerToken,
      "Content-Type": "application/json",
    };

    if (loginCustomerId) {
      headers["login-customer-id"] = loginCustomerId;
    }

    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: "POST",
        headers,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          const statusCode = res.statusCode || 0;
          const contentType = String(res.headers["content-type"] || "");

          if (statusCode < 200 || statusCode >= 300) {
            let details = data;
            try {
              details = JSON.stringify(JSON.parse(data));
            } catch (_err) {
              details = data.slice(0, 500).replace(/\s+/g, " ");
            }

            return reject(
              new Error(
                `Google Ads API error (${statusCode}) [${contentType || "unknown"}]: ${details}`,
              ),
            );
          }

          const looksJson =
            contentType.includes("application/json") ||
            data.trim().startsWith("{") ||
            data.trim().startsWith("[");

          if (!looksJson) {
            return reject(
              new Error(
                `Google Ads returned non-JSON response [${contentType || "unknown"}]: ${data
                  .slice(0, 500)
                  .replace(/\s+/g, " ")}`,
              ),
            );
          }

          try {
            const parsed = JSON.parse(data || "[]");
            const chunks = Array.isArray(parsed) ? parsed : [parsed];
            const results = [];
            for (const c of chunks) {
              if (Array.isArray(c.results)) {
                results.push(...c.results);
              }
            }
            resolve(results);
          } catch (err) {
            reject(
              new Error(
                `Failed to parse Google Ads JSON response: ${err.message}. Raw: ${data.slice(0, 500)}`,
              ),
            );
          }
        });
      },
    );

    req.on("error", (err) => {
      reject(new Error(`Google Ads request failed: ${err.message}`));
    });

    req.write(body);
    req.end();
  });
}

/**
 * Get daily campaign metrics between startDate and endDate (inclusive).
 * Dates must be YYYY-MM-DD.
 */
async function getGoogleCampaignDailyMetrics(startDate, endDate) {
  const query = `
    SELECT
      campaign.id,
      campaign.name,
      segments.date,
      metrics.clicks,
      metrics.impressions,
      metrics.cost_micros,
      metrics.conversions
    FROM campaign
    WHERE
      segments.date BETWEEN '${startDate}' AND '${endDate}'
      AND campaign.status != 'REMOVED'
  `;

  const rows = await googleAdsSearchStream(query);

  return rows.map((r) => {
    const campaign = r.campaign || {};
    const metrics = r.metrics || {};
    const segments = r.segments || {};

    const costMicros = Number(metrics.cost_micros || 0);

    return {
      campaignId: campaign.id,
      campaignName: campaign.name,
      date: segments.date,
      clicks: Number(metrics.clicks || 0),
      impressions: Number(metrics.impressions || 0),
      costMicros,
      cost: costMicros / 1_000_000,
      conversions:
        metrics.conversions != null ? Number(metrics.conversions) : null,
    };
  });
}

module.exports = {
  getGoogleCampaignDailyMetrics,
};

