const pool = require("../config/db");

async function upsertStoreRevenueMetric(row) {
  const {
    appKey,
    store,
    metricDate,
    currency = "USD",
    grossRevenue = 0,
    refunds = 0,
    taxes = 0,
    fees = 0,
    netRevenue = 0,
    transactions = 0,
    source = "store_report",
  } = row;

  await pool.query(
    `
      INSERT INTO store_revenue_metrics (
        app_key, store, metric_date, currency,
        gross_revenue, refunds, taxes, fees, net_revenue, transactions, source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        gross_revenue = VALUES(gross_revenue),
        refunds = VALUES(refunds),
        taxes = VALUES(taxes),
        fees = VALUES(fees),
        net_revenue = VALUES(net_revenue),
        transactions = VALUES(transactions),
        updated_at = CURRENT_TIMESTAMP
    `,
    [
      appKey,
      store,
      metricDate,
      currency,
      Number(grossRevenue) || 0,
      Number(refunds) || 0,
      Number(taxes) || 0,
      Number(fees) || 0,
      Number(netRevenue) || 0,
      Number(transactions) || 0,
      source,
    ],
  );
}

async function getNetRevenueTotal(startDate, endDate, appKey = null) {
  const conditions = ["metric_date BETWEEN ? AND ?"];
  const params = [startDate, endDate];

  if (appKey) {
    conditions.push("app_key = ?");
    params.push(appKey);
  }

  const [rows] = await pool.query(
    `
      SELECT COALESCE(SUM(net_revenue), 0) AS total
      FROM store_revenue_metrics
      WHERE ${conditions.join(" AND ")}
    `,
    params,
  );

  return Number(rows?.[0]?.total || 0);
}

async function getNetRevenueByStore(startDate, endDate, appKey = null) {
  const conditions = ["metric_date BETWEEN ? AND ?"];
  const params = [startDate, endDate];

  if (appKey) {
    conditions.push("app_key = ?");
    params.push(appKey);
  }

  const [rows] = await pool.query(
    `
      SELECT store, COALESCE(SUM(net_revenue), 0) AS total
      FROM store_revenue_metrics
      WHERE ${conditions.join(" AND ")}
      GROUP BY store
    `,
    params,
  );

  const out = {
    app_store: 0,
    google_play: 0,
  };
  for (const r of rows) {
    if (r.store === "app_store") out.app_store = Number(r.total) || 0;
    if (r.store === "google_play") out.google_play = Number(r.total) || 0;
  }
  return out;
}

module.exports = {
  upsertStoreRevenueMetric,
  getNetRevenueTotal,
  getNetRevenueByStore,
};
