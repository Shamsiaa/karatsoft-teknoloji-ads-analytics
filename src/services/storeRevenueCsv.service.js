const storeRevenueRepo = require("../db/storeRevenue.repository");
const crypto = require("crypto");

function splitLine(line, delimiter) {
  const out = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === delimiter && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }

    cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim());
}

function parseCsv(text) {
  const normalized = String(text || "").replace(/\r/g, "");
  const lines = normalized
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];
  const delimiter = lines[0].includes("\t") ? "\t" : ",";
  const headers = splitLine(lines[0], delimiter);

  return lines.slice(1).map((line) => {
    const parts = splitLine(line, delimiter);
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = parts[idx] ?? "";
    });
    return row;
  });
}

function pickValue(row, keys) {
  const loweredMap = {};
  Object.keys(row || {}).forEach((k) => {
    loweredMap[String(k).toLowerCase()] = row[k];
  });

  for (const key of keys) {
    if (row[key] != null && String(row[key]).trim() !== "") {
      return row[key];
    }

    const lowerHit = loweredMap[String(key).toLowerCase()];
    if (lowerHit != null && String(lowerHit).trim() !== "") {
      return lowerHit;
    }
  }
  return null;
}

function asNumber(v) {
  if (v == null) return 0;
  const cleaned = String(v).replace(/[$,\s]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function normalizeDate(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function shouldWriteSummary() {
  const raw = String(process.env.STORE_REVENUE_WRITE_SUMMARY || "false").toLowerCase();
  return raw === "true" || raw === "1";
}

function buildLineHash(appKey, store, source, row) {
  const base = JSON.stringify({
    appKey,
    store,
    source,
    row,
  });
  return crypto.createHash("sha256").update(base).digest("hex");
}

function normalizeRawLine(row, store, fallbackCurrency = "USD", options = {}) {
  const packageId = pickValue(row, ["Package ID", "package_id", "Package Id"]);
  if (store === "google_play" && options.packageName) {
    if (!packageId || String(packageId).trim() !== String(options.packageName).trim()) {
      return null;
    }
  }

  const metricDate = normalizeDate(
    pickValue(row, ["metric_date", "date", "Begin Date", "End Date", "Transaction Date", "Transaction date"]),
  );
  if (!metricDate) return null;

  const grossAmount = asNumber(
    pickValue(row, ["gross_revenue", "Gross Revenue", "Customer Price", "Amount (Buyer Currency)", "Amount (buyer currency)"]),
  );
  const netAmount = asNumber(
    pickValue(row, ["net_revenue", "Net Revenue", "Developer Proceeds", "Amount (Merchant Currency)", "Earnings (Merchant Currency)"]),
  );
  const currency = pickValue(row, ["currency", "Currency", "Merchant Currency"]) || fallbackCurrency;

  return {
    store,
    metricDate,
    currency,
    buyerCurrency: pickValue(row, ["Buyer currency", "Buyer Currency", "Customer Currency"]),
    buyerCountry: pickValue(row, ["Buyer country", "Buyer Country"]),
    packageId: pickValue(row, ["Package ID", "package_id", "Package Id"]),
    skuId: pickValue(row, ["SKU ID", "Sku ID", "sku_id"]),
    productTitle: pickValue(row, ["Product Title", "product_title"]),
    productType: pickValue(row, ["Product type", "Product Type", "product_type"]),
    transactionType: pickValue(row, ["Transaction Type", "transaction_type"]),
    refundType: pickValue(row, ["Refund type", "Refund Type", "refund_type"]),
    taxType: pickValue(row, ["Tax Type", "tax_type"]),
    salesChannel: pickValue(row, ["Sales channel", "Sales Channel", "sales_channel"]),
    grossAmount,
    netAmount,
  };
}

function normalizeRow(row, store, fallbackCurrency = "USD", options = {}) {
  const packageId = pickValue(row, ["Package ID", "package_id", "Package Id"]);
  if (store === "google_play" && options.packageName) {
    if (!packageId || String(packageId).trim() !== String(options.packageName).trim()) {
      return null;
    }
  }

  const metricDate = normalizeDate(
    pickValue(row, ["metric_date", "date", "Begin Date", "End Date", "Transaction Date", "Transaction date"]),
  );
  if (!metricDate) return null;

  const grossRevenue = asNumber(
    pickValue(row, ["gross_revenue", "Gross Revenue", "Customer Price", "Amount (Buyer Currency)", "Amount (buyer currency)"]),
  );
  const refunds = asNumber(
    pickValue(row, ["refunds", "Refunds", "Refund", "Chargeback Amount"]),
  );
  const taxes = asNumber(
    pickValue(row, ["taxes", "Taxes", "Tax Amount"]),
  );
  const fees = asNumber(
    pickValue(row, ["fees", "Fees", "Platform Fee", "Commission"]),
  );
  const netFromInput = pickValue(
    row,
    [
      "net_revenue",
      "Net Revenue",
      "Developer Proceeds",
      "Amount (Merchant Currency)",
      "Earnings (Merchant Currency)",
    ],
  );
  const netRevenue =
    netFromInput != null
      ? asNumber(netFromInput)
      : 0;

  const transactions = asNumber(
    pickValue(row, ["transactions", "Transactions", "Units", "Quantity"]),
  );
  const currency = pickValue(
    row,
    ["currency", "Currency", "Customer Currency", "Merchant Currency"],
  ) || fallbackCurrency;

  return {
    store,
    metricDate,
    grossRevenue,
    refunds,
    taxes,
    fees,
    netRevenue,
    transactions,
    currency,
  };
}

async function importStoreCsv(appKey, csvText, store, currency = "USD", source = "store_csv", options = {}) {
  const parsed = parseCsv(csvText);
  const normalizedForSummary = [];
  let acceptedRawLines = 0;

  for (const parsedRow of parsed) {
    const rawLine = normalizeRawLine(parsedRow, store, currency, options);
    if (rawLine) {
      acceptedRawLines += 1;
      await storeRevenueRepo.insertStoreRevenueLine({
        appKey,
        store,
        metricDate: rawLine.metricDate,
        source,
        currency: rawLine.currency,
        buyerCurrency: rawLine.buyerCurrency,
        buyerCountry: rawLine.buyerCountry,
        packageId: rawLine.packageId,
        skuId: rawLine.skuId,
        productTitle: rawLine.productTitle,
        productType: rawLine.productType,
        transactionType: rawLine.transactionType,
        refundType: rawLine.refundType,
        taxType: rawLine.taxType,
        salesChannel: rawLine.salesChannel,
        grossAmount: rawLine.grossAmount,
        netAmount: rawLine.netAmount,
        rowHash: buildLineHash(appKey, store, source, parsedRow),
        rawJson: parsedRow,
      });
    }

    if (shouldWriteSummary()) {
      const summaryRow = normalizeRow(parsedRow, store, currency, options);
      if (summaryRow) normalizedForSummary.push(summaryRow);
    }
  }

  if (shouldWriteSummary()) {
    for (const row of normalizedForSummary) {
      await storeRevenueRepo.upsertStoreRevenueMetric({
        appKey,
        store: row.store,
        metricDate: row.metricDate,
        currency: row.currency,
        grossRevenue: row.grossRevenue,
        refunds: row.refunds,
        taxes: row.taxes,
        fees: row.fees,
        netRevenue: row.netRevenue,
        transactions: row.transactions,
        source,
      });
    }
  }

  return {
    imported: acceptedRawLines,
    skipped: parsed.length - acceptedRawLines,
    rawLines: parsed.length,
    summaryWritten: shouldWriteSummary(),
  };
}

module.exports = {
  importStoreCsv,
};
