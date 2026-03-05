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

async function insertStoreRevenueLine(row) {
  const {
    appKey,
    store,
    metricDate,
    source = "store_report",
    currency = null,
    buyerCurrency = null,
    buyerCountry = null,
    packageId = null,
    skuId = null,
    productTitle = null,
    productType = null,
    transactionType = null,
    refundType = null,
    taxType = null,
    salesChannel = null,
    grossAmount = 0,
    netAmount = 0,
    rowHash,
    rawJson = null,
  } = row;

  await pool.query(
    `
      INSERT INTO store_revenue_lines (
        app_key, store, metric_date, source, currency, buyer_currency, buyer_country,
        package_id, sku_id, product_title, product_type, transaction_type, refund_type,
        tax_type, sales_channel, gross_amount, net_amount, row_hash, raw_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        source = VALUES(source)
    `,
    [
      appKey,
      store,
      metricDate,
      source,
      currency,
      buyerCurrency,
      buyerCountry,
      packageId,
      skuId,
      productTitle,
      productType,
      transactionType,
      refundType,
      taxType,
      salesChannel,
      Number(grossAmount) || 0,
      Number(netAmount) || 0,
      rowHash,
      rawJson ? JSON.stringify(rawJson) : null,
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

async function getNetRevenueByStoreCurrency(startDate, endDate, appKey = null) {
  const conditions = ["metric_date BETWEEN ? AND ?"];
  const params = [startDate, endDate];

  if (appKey) {
    conditions.push("app_key = ?");
    params.push(appKey);
  }

  const [rows] = await pool.query(
    `
      SELECT store, currency, COALESCE(SUM(net_revenue), 0) AS total
      FROM store_revenue_metrics
      WHERE ${conditions.join(" AND ")}
      GROUP BY store, currency
    `,
    params,
  );

  return rows.map((r) => ({
    store: r.store,
    currency: r.currency,
    total: Number(r.total) || 0,
  }));
}

async function listStoreRevenueLines({
  appKey,
  store = null,
  startDate = null,
  endDate = null,
  limit = 200,
}) {
  const conditions = ["app_key = ?"];
  const params = [appKey];

  if (store) {
    conditions.push("store = ?");
    params.push(store);
  }
  if (startDate && endDate) {
    conditions.push("metric_date BETWEEN ? AND ?");
    params.push(startDate, endDate);
  } else if (startDate) {
    conditions.push("metric_date >= ?");
    params.push(startDate);
  } else if (endDate) {
    conditions.push("metric_date <= ?");
    params.push(endDate);
  }

  const safeLimit = Math.min(Math.max(Number(limit) || 200, 1), 2000);
  params.push(safeLimit);

  const [rows] = await pool.query(
    `
      SELECT
        app_key AS appKey,
        store,
        metric_date AS metricDate,
        source,
        currency,
        buyer_currency AS buyerCurrency,
        buyer_country AS buyerCountry,
        package_id AS packageId,
        sku_id AS skuId,
        product_title AS productTitle,
        product_type AS productType,
        transaction_type AS transactionType,
        refund_type AS refundType,
        tax_type AS taxType,
        sales_channel AS salesChannel,
        gross_amount AS grossAmount,
        net_amount AS netAmount,
        row_hash AS rowHash
      FROM store_revenue_lines
      WHERE ${conditions.join(" AND ")}
      ORDER BY metric_date DESC, id DESC
      LIMIT ?
    `,
    params,
  );

  return rows;
}

async function getRawRevenueByStoreCurrency(startDate, endDate, appKey = null) {
  const conditions = ["metric_date BETWEEN ? AND ?"];
  const params = [startDate, endDate];

  if (appKey) {
    conditions.push("app_key = ?");
    params.push(appKey);
  }

  const [rows] = await pool.query(
    `
      SELECT store, currency, COALESCE(SUM(net_amount), 0) AS total
      FROM store_revenue_lines
      WHERE ${conditions.join(" AND ")}
      GROUP BY store, currency
      ORDER BY store, currency
    `,
    params,
  );

  return rows.map((r) => ({
    store: r.store,
    currency: r.currency || "UNKNOWN",
    total: Number(r.total) || 0,
  }));
}

module.exports = {
  upsertStoreRevenueMetric,
  insertStoreRevenueLine,
  getNetRevenueTotal,
  getNetRevenueByStore,
  getNetRevenueByStoreCurrency,
  listStoreRevenueLines,
  getRawRevenueByStoreCurrency,
};
