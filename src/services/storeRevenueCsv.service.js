const storeRevenueRepo = require("../db/storeRevenue.repository");

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
  for (const key of keys) {
    if (row[key] != null && String(row[key]).trim() !== "") {
      return row[key];
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

function normalizeRow(row, store, fallbackCurrency = "USD") {
  const metricDate = normalizeDate(
    pickValue(row, ["metric_date", "date", "Begin Date", "End Date", "Transaction Date"]),
  );
  if (!metricDate) return null;

  const grossRevenue = asNumber(
    pickValue(row, ["gross_revenue", "Gross Revenue", "Customer Price", "Amount (Buyer Currency)"]),
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
      : grossRevenue - refunds - taxes - fees;

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

async function importStoreCsv(appKey, csvText, store, currency = "USD", source = "store_csv") {
  const parsed = parseCsv(csvText);
  const normalized = parsed
    .map((row) => normalizeRow(row, store, currency))
    .filter(Boolean);

  for (const row of normalized) {
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

  return {
    imported: normalized.length,
    skipped: parsed.length - normalized.length,
  };
}

module.exports = {
  importStoreCsv,
};
