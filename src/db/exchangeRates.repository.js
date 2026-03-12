const pool = require("../config/db");

async function upsertCurrency(currencyCode, currencyName = null) {
  const code = String(currencyCode || "").trim().toUpperCase();
  if (!code || code.length !== 3) {
    throw new Error(`Invalid currency code: ${currencyCode}`);
  }

  await pool.query(
    `
      INSERT INTO currencies (currency_code, currency_name)
      VALUES (?, ?)
      ON DUPLICATE KEY UPDATE
        currency_name = COALESCE(VALUES(currency_name), currency_name)
    `,
    [code, currencyName],
  );
}

async function getCurrencyByCode(currencyCode) {
  const code = String(currencyCode || "").trim().toUpperCase();
  const [rows] = await pool.query(
    `
      SELECT id, currency_code AS currencyCode, currency_name AS currencyName
      FROM currencies
      WHERE currency_code = ?
      LIMIT 1
    `,
    [code],
  );
  return rows[0] || null;
}

async function upsertExchangeRate(currencyCode, rateDate, exchangeRate) {
  await upsertCurrency(currencyCode, null);
  const currency = await getCurrencyByCode(currencyCode);
  if (!currency) {
    throw new Error(`Currency not found after upsert: ${currencyCode}`);
  }

  await pool.query(
    `
      INSERT INTO exchange_rates (currency_id, rate_date, exchange_rate)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE
        exchange_rate = VALUES(exchange_rate)
    `,
    [currency.id, rateDate, Number(exchangeRate)],
  );
}

module.exports = {
  upsertCurrency,
  getCurrencyByCode,
  upsertExchangeRate,
  listExchangeRatesByDateRange: async function listExchangeRatesByDateRange(currencyCode, startDate, endDate) {
    const code = String(currencyCode || "").trim().toUpperCase();
    const [rows] = await pool.query(
      `
        SELECT
          c.currency_code AS currencyCode,
          e.rate_date AS rateDate,
          e.exchange_rate AS exchangeRate
        FROM exchange_rates e
        JOIN currencies c ON c.id = e.currency_id
        WHERE c.currency_code = ?
          AND e.rate_date BETWEEN ? AND ?
        ORDER BY e.rate_date
      `,
      [code, startDate, endDate],
    );
    return rows.map((r) => ({
      currencyCode: r.currencyCode,
      rateDate: new Date(r.rateDate).toISOString().slice(0, 10),
      exchangeRate: Number(r.exchangeRate),
    }));
  },
  listExchangeRatesByDateRangeForCurrencies: async function listExchangeRatesByDateRangeForCurrencies(currencyCodes, startDate, endDate) {
    const codes = Array.from(new Set((currencyCodes || []).map((c) => String(c || "").trim().toUpperCase()).filter(Boolean)));
    if (!codes.length) return [];
    const placeholders = codes.map(() => "?").join(", ");
    const [rows] = await pool.query(
      `
        SELECT
          c.currency_code AS currencyCode,
          e.rate_date AS rateDate,
          e.exchange_rate AS exchangeRate
        FROM exchange_rates e
        JOIN currencies c ON c.id = e.currency_id
        WHERE c.currency_code IN (${placeholders})
          AND e.rate_date BETWEEN ? AND ?
        ORDER BY c.currency_code, e.rate_date
      `,
      [...codes, startDate, endDate],
    );
    return rows.map((r) => ({
      currencyCode: r.currencyCode,
      rateDate: new Date(r.rateDate).toISOString().slice(0, 10),
      exchangeRate: Number(r.exchangeRate),
    }));
  },
};
