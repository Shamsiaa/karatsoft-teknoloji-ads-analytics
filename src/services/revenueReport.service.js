const { fetchRevenueMetrics } = require("./revenueCat/api.client");
const revenueRepo = require("../db/revenueMetrics.repository");
const adMetricsRepo = require("../db/adMetrics.repository");
const storeRevenueRepo = require("../db/storeRevenue.repository");
const logger = require("../utils/logger");
const https = require("https");

function shouldUseRevenuecatFallback() {
  const raw = String(process.env.USE_REVENUECAT_FALLBACK ?? "true").toLowerCase();
  return raw !== "false" && raw !== "0";
}

async function syncRevenueForDate(date) {
  const items = await fetchRevenueMetrics(date, date);

  for (const item of items) {
    await revenueRepo.upsertRevenueMetric({
      source: "revenuecat",
      ...item,
      metric_date: date,
    });
  }

  return {
    date,
    platform: "revenuecat",
    count: items.length,
  };
}

async function getRevenueReport(startDate, endDate, appId = null) {
  const rows = await revenueRepo.getRevenueReport(startDate, endDate, appId);

  return rows.map((row) => {
    if (row.source === "revenuecat") {
      return {
        ...row,
        dataType: "aggregate_overview",
        granularity: "snapshot",
      };
    }

    return row;
  });
}

async function getSpendRevenueComparison(startDate, endDate, appKey = null) {
  const [spendTotal, directStoreRevenue] = await Promise.all([
    adMetricsRepo.getCostTotal(startDate, endDate, null, appKey),
    storeRevenueRepo.getNetRevenueTotal(startDate, endDate, appKey),
  ]);

  let revenueTotal = directStoreRevenue;
  let revenueSource =
    directStoreRevenue > 0
      ? "direct_store_financial_data"
      : "no_revenue_source";

  if (revenueTotal <= 0 && shouldUseRevenuecatFallback()) {
    revenueTotal = await revenueRepo.getNetRevenueTotal(startDate, endDate);
    revenueSource = "revenuecat_aggregate_fallback";
  }

  const roas = spendTotal > 0 ? revenueTotal / spendTotal : null;

  logger.info("revenue.compare.calculated", {
    startDate,
    endDate,
    appKey,
    spendTotal,
    revenueTotal,
    revenueSource,
    roas,
  });

  return {
    startDate,
    endDate,
    spend: spendTotal,
    revenue: revenueTotal,
    profit: revenueTotal - spendTotal,
    roas,
    revenueDataType:
      revenueSource === "direct_store_financial_data"
        ? "store_financial_report"
        : (revenueSource === "revenuecat_aggregate_fallback" ? "aggregate_overview" : "none"),
    revenueGranularity:
      revenueSource === "direct_store_financial_data"
        ? "daily"
        : (revenueSource === "revenuecat_aggregate_fallback" ? "snapshot" : "none"),
    revenueSource,
    note:
      revenueSource === "direct_store_financial_data"
        ? "Revenue is derived from direct store financial data."
        : (revenueSource === "revenuecat_aggregate_fallback"
          ? "Revenue is derived from RevenueCat fallback (aggregate overview)."
          : "No revenue source data found for selected filters/date range."),
  };
}

function parseCsvEnv(name) {
  const raw = process.env[name];
  if (!raw) return [];
  return raw
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

async function getPlatformSpendRevenueComparison(startDate, endDate, appKey = null) {
  const [appleSpend, googleSpend, storeSplit, directStoreRevenueTotal] = await Promise.all([
    adMetricsRepo.getCostTotal(startDate, endDate, "apple", appKey),
    adMetricsRepo.getCostTotal(startDate, endDate, "google", appKey),
    storeRevenueRepo.getNetRevenueByStore(startDate, endDate, appKey),
    storeRevenueRepo.getNetRevenueTotal(startDate, endDate, appKey),
  ]);

  const totalSpend = appleSpend + googleSpend;
  const useFallback = shouldUseRevenuecatFallback();
  const fallbackRevenueTotal = directStoreRevenueTotal > 0
    ? directStoreRevenueTotal
    : (useFallback ? await revenueRepo.getNetRevenueTotal(startDate, endDate) : 0);

  const appleAppIds = parseCsvEnv("REVENUECAT_APPLE_APP_IDS");
  const googleAppIds = parseCsvEnv("REVENUECAT_GOOGLE_APP_IDS");

  let appleRevenue = storeSplit.app_store;
  let googleRevenue = storeSplit.google_play;
  let revenueAttribution = directStoreRevenueTotal > 0
    ? "direct_store_financial_data"
    : "no_revenue_source";
  let appleRevenueSource = directStoreRevenueTotal > 0 ? "direct_store_financial_data" : "no_revenue_source";
  let googleRevenueSource = directStoreRevenueTotal > 0 ? "direct_store_financial_data" : "no_revenue_source";
  let totalRevenue = directStoreRevenueTotal > 0 ? directStoreRevenueTotal : 0;
  let unmappedRevenue = 0;

  if (directStoreRevenueTotal <= 0 && (appleAppIds.length > 0 || googleAppIds.length > 0) && useFallback) {
    const [appleMapped, googleMapped] = await Promise.all([
      revenueRepo.getNetRevenueByAppIds(startDate, endDate, appleAppIds),
      revenueRepo.getNetRevenueByAppIds(startDate, endDate, googleAppIds),
    ]);

    appleRevenue = appleMapped;
    googleRevenue = googleMapped;
    totalRevenue = appleRevenue + googleRevenue;
    unmappedRevenue = Math.max(0, fallbackRevenueTotal - totalRevenue);
    appleRevenueSource = "revenuecat_app_id_mapping";
    googleRevenueSource = "revenuecat_app_id_mapping";
    revenueAttribution =
      totalRevenue > 0
        ? "mapped_by_revenuecat_app_ids"
        : "mapping_attempted_no_match_fallback_spend_share";

    if (revenueAttribution === "mapping_attempted_no_match_fallback_spend_share" && totalSpend > 0) {
      appleRevenue = fallbackRevenueTotal * (appleSpend / totalSpend);
      googleRevenue = fallbackRevenueTotal * (googleSpend / totalSpend);
      totalRevenue = fallbackRevenueTotal;
      unmappedRevenue = 0;
      appleRevenueSource = "revenuecat_spend_share_fallback";
      googleRevenueSource = "revenuecat_spend_share_fallback";
    }
  } else if (directStoreRevenueTotal <= 0 && totalSpend > 0 && useFallback) {
    appleRevenue = fallbackRevenueTotal * (appleSpend / totalSpend);
    googleRevenue = fallbackRevenueTotal * (googleSpend / totalSpend);
    totalRevenue = fallbackRevenueTotal;
    appleRevenueSource = "revenuecat_spend_share_fallback";
    googleRevenueSource = "revenuecat_spend_share_fallback";
    revenueAttribution = "estimated_by_spend_share";
  } else if (directStoreRevenueTotal > 0) {
    totalRevenue = directStoreRevenueTotal;
  }

  const appleRoas = appleSpend > 0 ? appleRevenue / appleSpend : null;
  const googleRoas = googleSpend > 0 ? googleRevenue / googleSpend : null;
  const totalRoas = totalSpend > 0 ? totalRevenue / totalSpend : null;

  logger.info("revenue.platform_compare.calculated", {
    startDate,
    endDate,
    appKey,
    useFallback,
    revenueAttribution,
    appleSpend,
    appleRevenue,
    googleSpend,
    googleRevenue,
    totalSpend,
    totalRevenue,
    unmappedRevenue,
  });

  return {
    startDate,
    endDate,
    apple: {
      spend: appleSpend,
      revenue: appleRevenue,
      profit: appleRevenue - appleSpend,
      roas: appleRoas,
      revenueSource: appleRevenueSource,
    },
    google: {
      spend: googleSpend,
      revenue: googleRevenue,
      profit: googleRevenue - googleSpend,
      roas: googleRoas,
      revenueSource: googleRevenueSource,
    },
    total: {
      spend: totalSpend,
      revenue: totalRevenue,
      profit: totalRevenue - totalSpend,
      roas: totalRoas,
      revenueSource:
        directStoreRevenueTotal > 0
          ? "direct_store_financial_data"
          : (useFallback ? "revenuecat_fallback" : "no_revenue_source"),
    },
    revenueAttribution,
    unmappedRevenue,
  };
}

function requestJson(url) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request(
      {
        method: "GET",
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        path: `${parsed.pathname}${parsed.search}`,
        headers: { Accept: "application/json" },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => {
          data += c;
        });
        res.on("end", () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(new Error(`FX API error (${res.statusCode}): ${data.slice(0, 300)}`));
          }
          try {
            return resolve(JSON.parse(data || "{}"));
          } catch (err) {
            return reject(new Error(`FX API parse error: ${err.message}`));
          }
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

async function fetchFxRate(fromCurrency, toCurrency, date) {
  if (fromCurrency === toCurrency) return 1;
  const url = new URL(`https://api.frankfurter.app/${date}`);
  url.searchParams.set("from", fromCurrency);
  url.searchParams.set("to", toCurrency);
  const json = await requestJson(url.toString());
  const rate = json?.rates?.[toCurrency];
  if (!rate || !Number.isFinite(Number(rate))) {
    throw new Error(`Missing FX rate ${fromCurrency}->${toCurrency} for ${date}`);
  }
  return Number(rate);
}

async function getPlatformSpendRevenueComparisonNormalized(
  startDate,
  endDate,
  appKey = null,
  targetCurrency = "USD",
) {
  const [appleSpend, googleSpend, byStoreCurrency] = await Promise.all([
    adMetricsRepo.getCostTotal(startDate, endDate, "apple", appKey),
    adMetricsRepo.getCostTotal(startDate, endDate, "google", appKey),
    storeRevenueRepo.getNetRevenueByStoreCurrency(startDate, endDate, appKey),
  ]);

  const rows = byStoreCurrency || [];
  const uniqueCurrencies = [...new Set(rows.map((r) => String(r.currency || "").toUpperCase()).filter(Boolean))];
  const fxDate = endDate;
  const rates = {};
  const missingRates = [];

  for (const currency of uniqueCurrencies) {
    if (currency === targetCurrency) {
      rates[currency] = 1;
      continue;
    }
    try {
      rates[currency] = await fetchFxRate(currency, targetCurrency, fxDate);
    } catch (error) {
      missingRates.push({
        currency,
        reason: error.message,
      });
    }
  }

  let appleRevenue = 0;
  let googleRevenue = 0;
  for (const row of rows) {
    const currency = String(row.currency || "").toUpperCase();
    const rate = rates[currency];
    if (!rate) continue;
    const converted = (Number(row.total) || 0) * rate;
    if (row.store === "app_store") appleRevenue += converted;
    if (row.store === "google_play") googleRevenue += converted;
  }

  const totalSpend = appleSpend + googleSpend;
  const totalRevenue = appleRevenue + googleRevenue;

  const result = {
    startDate,
    endDate,
    appKey,
    targetCurrency,
    fxDate,
    fxProvider: "frankfurter",
    rates,
    missingRates,
    apple: {
      spend: appleSpend,
      revenue: appleRevenue,
      profit: appleRevenue - appleSpend,
      roas: appleSpend > 0 ? appleRevenue / appleSpend : null,
      revenueSource: "direct_store_financial_data",
    },
    google: {
      spend: googleSpend,
      revenue: googleRevenue,
      profit: googleRevenue - googleSpend,
      roas: googleSpend > 0 ? googleRevenue / googleSpend : null,
      revenueSource: "direct_store_financial_data",
    },
    total: {
      spend: totalSpend,
      revenue: totalRevenue,
      profit: totalRevenue - totalSpend,
      roas: totalSpend > 0 ? totalRevenue / totalSpend : null,
      revenueSource: "direct_store_financial_data",
    },
  };

  logger.info("revenue.platform_compare_normalized.calculated", {
    startDate,
    endDate,
    appKey,
    targetCurrency,
    totalSpend,
    totalRevenue,
    missingRatesCount: missingRates.length,
  });

  return result;
}

async function getPlatformRevenueRawByCurrency(startDate, endDate, appKey = null) {
  const rows = await storeRevenueRepo.getRawRevenueByStoreCurrency(startDate, endDate, appKey);

  const apple = [];
  const google = [];
  for (const row of rows) {
    const item = {
      currency: row.currency,
      revenue: row.total,
    };
    if (row.store === "app_store") apple.push(item);
    if (row.store === "google_play") google.push(item);
  }

  return {
    startDate,
    endDate,
    appKey,
    mathMode: "raw_csv_no_conversion",
    note: "Ham magaza verisi (donusum yok). Para birimleri birlestirilmedi.",
    apple,
    google,
  };
}

module.exports = {
  syncRevenueForDate,
  getRevenueReport,
  getSpendRevenueComparison,
  getPlatformSpendRevenueComparison,
  getPlatformSpendRevenueComparisonNormalized,
  getPlatformRevenueRawByCurrency,
};
