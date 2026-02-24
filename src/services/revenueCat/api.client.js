const https = require("https");

const RC_BASE_URL = process.env.REVENUECAT_API_BASE_URL || "https://api.revenuecat.com/v2";
const RC_API_KEY = process.env.REVENUECAT_API_KEY;
const RC_PROJECT_ID = process.env.REVENUECAT_PROJECT_ID;

function buildMetricsPath(startDate, endDate) {
  const configuredTemplate = process.env.REVENUECAT_METRICS_PATH_TEMPLATE;

  if (configuredTemplate) {
    return configuredTemplate
      .replace("{projectId}", encodeURIComponent(RC_PROJECT_ID || ""))
      .replace("{startDate}", encodeURIComponent(startDate))
      .replace("{endDate}", encodeURIComponent(endDate));
  }

  if (!RC_PROJECT_ID) {
    throw new Error("REVENUECAT_PROJECT_ID is required for default metrics path");
  }

  return `/projects/${encodeURIComponent(RC_PROJECT_ID)}/metrics/overview?start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(endDate)}&granularity=daily`;
}

function requestRevenueCat(path) {
  if (!RC_API_KEY) {
    throw new Error("REVENUECAT_API_KEY is not configured");
  }

  const url = new URL(path, RC_BASE_URL);

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        method: "GET",
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || 443,
        path: `${url.pathname}${url.search}`,
        headers: {
          Authorization: `Bearer ${RC_API_KEY}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          let parsed;
          try {
            parsed = data ? JSON.parse(data) : {};
          } catch (error) {
            return reject(new Error(`RevenueCat response is not valid JSON: ${data}`));
          }

          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(
              new Error(
                `RevenueCat request failed (${res.statusCode}): ${JSON.stringify(parsed)}`
              )
            );
          }

          return resolve(parsed);
        });
      }
    );

    req.on("error", reject);
    req.end();
  });
}

function normalizeMetricItem(item, fallbackDate) {
  return {
    app_id: item.app_id || item.appId || item.product_id || item.productId || "unknown-app",
    app_name: item.app_name || item.appName || null,
    metric_date: item.date || item.metric_date || fallbackDate,
    country_code: item.country_code || item.countryCode || null,
    currency: item.currency || "USD",
    gross_revenue: item.gross_revenue ?? item.grossRevenue ?? item.revenue ?? 0,
    refunds: item.refunds ?? 0,
    net_revenue:
      item.net_revenue ??
      item.netRevenue ??
      (Number(item.gross_revenue ?? item.grossRevenue ?? item.revenue ?? 0) - Number(item.refunds ?? 0)),
    transactions: item.transactions ?? item.transaction_count ?? item.transactionCount ?? 0,
  };
}

function parseRevenueMetrics(payload, startDate, endDate) {
  const possibleCollections = [
    payload.items,
    payload.data,
    payload.results,
    payload.metrics,
    payload?.data?.items,
  ];

  const collection = possibleCollections.find((value) => Array.isArray(value));
  if (!collection) {
    throw new Error("RevenueCat payload does not contain a metrics array (items/data/results/metrics)");
  }

  return collection.map((item) => normalizeMetricItem(item, endDate || startDate));
}

async function fetchRevenueMetrics(startDate, endDate) {
  const path = buildMetricsPath(startDate, endDate);
  const payload = await requestRevenueCat(path);
  return parseRevenueMetrics(payload, startDate, endDate);
}

module.exports = {
  fetchRevenueMetrics,
};
