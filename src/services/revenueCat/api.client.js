const https = require("https");

const RC_BASE_URL =
  process.env.REVENUECAT_API_BASE_URL || "https://api.revenuecat.com/v2";
const RC_API_KEY = process.env.REVENUECAT_API_KEY;
const RC_PROJECT_ID = process.env.REVENUECAT_PROJECT_ID;

function buildMetricsPath(startDate, endDate) {
  const configuredTemplate =
    process.env.REVENUECAT_METRICS_PATH_TEMPLATE ||
    process.env.REVENUECAT_CHARTS_PATH_TEMPLATE;

  if (configuredTemplate) {
    return configuredTemplate
      .trim()
      .replace("{projectId}", encodeURIComponent(RC_PROJECT_ID || ""))
      .replace("{startDate}", encodeURIComponent(startDate))
      .replace("{endDate}", encodeURIComponent(endDate));
  }

  if (!RC_PROJECT_ID) {
    throw new Error(
      "REVENUECAT_PROJECT_ID is required for default metrics path",
    );
  }

  // RevenueCat v2 charts API (overview chart)
  return `/projects/${encodeURIComponent(
    RC_PROJECT_ID,
  )}/charts/overview?start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(
    endDate,
  )}&granularity=daily`;
}

function buildRequestUrl(path) {
  const normalizedBase = RC_BASE_URL.endsWith("/")
    ? RC_BASE_URL
    : `${RC_BASE_URL}/`;
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  return new URL(normalizedPath, normalizedBase);
}

function requestRevenueCat(path) {
  if (!RC_API_KEY) {
    throw new Error("REVENUECAT_API_KEY is not configured");
  }

  const url = buildRequestUrl(path);

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
            return reject(
              new Error(`RevenueCat response is not valid JSON: ${data}`),
            );
          }

          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(
              new Error(
                `RevenueCat request failed (${res.statusCode}) for ${url.pathname}${url.search}: ${JSON.stringify(
                  parsed,
                )}`,
              ),
            );
          }

          return resolve(parsed);
        });
      },
    );

    req.on("error", reject);
    req.end();
  });
}

function normalizeMetricItem(item, fallbackDate) {
  return {
    app_id:
      item.app_id ||
      item.appId ||
      item.product_id ||
      item.productId ||
      "unknown-app",
    app_name: item.app_name || item.appName || null,
    metric_date: item.date || item.metric_date || fallbackDate,
    country_code: item.country_code || item.countryCode || null,
    currency: item.currency || "USD",
    gross_revenue: item.gross_revenue ?? item.grossRevenue ?? item.revenue ?? 0,
    refunds: item.refunds ?? 0,
    net_revenue:
      item.net_revenue ??
      item.netRevenue ??
      Number(item.gross_revenue ?? item.grossRevenue ?? item.revenue ?? 0) -
        Number(item.refunds ?? 0),
    transactions:
      item.transactions ?? item.transaction_count ?? item.transactionCount ?? 0,
  };
}

function getMetricValueByIds(metrics, ids, defaultValue = 0) {
  for (const id of ids) {
    const metric = metrics.find((m) => String(m?.id || "").toLowerCase() === id);
    if (metric && metric.value != null) {
      return Number(metric.value) || 0;
    }
  }
  return defaultValue;
}

function isOverviewMetricsPayload(collection) {
  return (
    collection.length > 0 &&
    collection.every(
      (item) =>
        item &&
        (item.object === "overview_metric" ||
          (typeof item.id === "string" && item.value != null)),
    )
  );
}

function parseOverviewMetrics(collection, fallbackDate) {
  const normalized = collection.map((m) => ({
    ...m,
    id: String(m.id || "").toLowerCase(),
  }));

  const grossRevenue = getMetricValueByIds(normalized, [
    "gross_revenue",
    "revenue",
    "total_revenue",
  ]);
  const refunds = getMetricValueByIds(normalized, ["refunds"]);
  const netRevenue = getMetricValueByIds(
    normalized,
    ["net_revenue", "proceeds", "revenue_after_refunds"],
    grossRevenue - refunds,
  );
  const transactions = getMetricValueByIds(normalized, [
    "transactions",
    "purchases",
    "renewals",
  ]);
  const mrr = getMetricValueByIds(normalized, ["mrr"], 0);

  // overview endpoint is aggregate-level; if net/gross are not present,
  // use MRR as a fallback so report is not forced to zero.
  const finalNetRevenue = netRevenue > 0 ? netRevenue : mrr;
  const finalGrossRevenue = grossRevenue > 0 ? grossRevenue : finalNetRevenue;

  return [
    {
      app_id: process.env.REVENUECAT_APP_ID || RC_PROJECT_ID || "revenuecat-project",
      app_name: process.env.REVENUECAT_APP_NAME || null,
      metric_date: fallbackDate,
      country_code: null,
      currency: "USD",
      gross_revenue: finalGrossRevenue,
      refunds,
      net_revenue: finalNetRevenue,
      transactions,
    },
  ];
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
    throw new Error(
      "RevenueCat payload does not contain a metrics array (items/data/results/metrics)",
    );
  }

  if (isOverviewMetricsPayload(collection)) {
    return parseOverviewMetrics(collection, endDate || startDate);
  }

  return collection.map((item) =>
    normalizeMetricItem(item, endDate || startDate),
  );
}

async function fetchRevenueMetrics(startDate, endDate) {
  const path = buildMetricsPath(startDate, endDate);
  const payload = await requestRevenueCat(path);
  return parseRevenueMetrics(payload, startDate, endDate);
}

module.exports = {
  fetchRevenueMetrics,
};
