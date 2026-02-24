const pool = require("../config/db");

async function upsertRevenueMetric(row) {
  const {
    source = "revenuecat",
    app_id: appId,
    app_name: appName = null,
    metric_date: metricDate,
    country_code: countryCode = null,
    currency = "USD",
    gross_revenue: grossRevenue = 0,
    refunds = 0,
    net_revenue: netRevenue = 0,
    transactions = 0,
  } = row;

  await pool.query(
    `
      INSERT INTO revenue_metrics (
        source, app_id, app_name, metric_date, country_code, currency,
        gross_revenue, refunds, net_revenue, transactions
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        app_name = VALUES(app_name),
        gross_revenue = VALUES(gross_revenue),
        refunds = VALUES(refunds),
        net_revenue = VALUES(net_revenue),
        transactions = VALUES(transactions),
        updated_at = CURRENT_TIMESTAMP
    `,
    [
      source,
      String(appId),
      appName,
      metricDate,
      countryCode,
      currency,
      Number(grossRevenue) || 0,
      Number(refunds) || 0,
      Number(netRevenue) || 0,
      Number(transactions) || 0,
    ]
  );
}

async function getRevenueReport(startDate, endDate, appId = null) {
  const conditions = ["metric_date BETWEEN ? AND ?"];
  const params = [startDate, endDate];

  if (appId) {
    conditions.push("app_id = ?");
    params.push(appId);
  }

  const [rows] = await pool.query(
    `
      SELECT
        source,
        app_id AS appId,
        app_name AS appName,
        currency,
        SUM(gross_revenue) AS grossRevenue,
        SUM(refunds) AS refunds,
        SUM(net_revenue) AS netRevenue,
        SUM(transactions) AS transactions
      FROM revenue_metrics
      WHERE ${conditions.join(" AND ")}
      GROUP BY source, app_id, app_name, currency
      ORDER BY source, app_name, app_id, currency
    `,
    params
  );

  return rows.map((r) => ({
    source: r.source,
    appId: r.appId,
    appName: r.appName || "",
    currency: r.currency,
    grossRevenue: Number(r.grossRevenue) || 0,
    refunds: Number(r.refunds) || 0,
    netRevenue: Number(r.netRevenue) || 0,
    transactions: Number(r.transactions) || 0,
  }));
}

async function getNetRevenueTotal(startDate, endDate) {
  const [rows] = await pool.query(
    `
      SELECT COALESCE(SUM(net_revenue), 0) AS total
      FROM revenue_metrics
      WHERE metric_date BETWEEN ? AND ?
    `,
    [startDate, endDate]
  );

  return Number(rows?.[0]?.total || 0);
}

module.exports = {
  upsertRevenueMetric,
  getRevenueReport,
  getNetRevenueTotal,
};
