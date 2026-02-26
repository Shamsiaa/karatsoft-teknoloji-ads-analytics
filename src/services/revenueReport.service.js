const { fetchRevenueMetrics } = require("./revenueCat/api.client");
const revenueRepo = require("../db/revenueMetrics.repository");
const adMetricsRepo = require("../db/adMetrics.repository");

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

async function getSpendRevenueComparison(startDate, endDate) {
  const [spendTotal, revenueTotal] = await Promise.all([
    adMetricsRepo.getCostTotal(startDate, endDate),
    revenueRepo.getNetRevenueTotal(startDate, endDate),
  ]);

  const roas = spendTotal > 0 ? revenueTotal / spendTotal : null;

  return {
    startDate,
    endDate,
    spend: spendTotal,
    revenue: revenueTotal,
    profit: revenueTotal - spendTotal,
    roas,
    revenueDataType: "aggregate_overview",
    revenueGranularity: "snapshot",
    note: "Revenue is derived from RevenueCat overview metrics and is not transactional daily revenue.",
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

async function getPlatformSpendRevenueComparison(startDate, endDate) {
  const [appleSpend, googleSpend, totalRevenue] = await Promise.all([
    adMetricsRepo.getCostTotal(startDate, endDate, "apple"),
    adMetricsRepo.getCostTotal(startDate, endDate, "google"),
    revenueRepo.getNetRevenueTotal(startDate, endDate),
  ]);

  const totalSpend = appleSpend + googleSpend;

  const appleAppIds = parseCsvEnv("REVENUECAT_APPLE_APP_IDS");
  const googleAppIds = parseCsvEnv("REVENUECAT_GOOGLE_APP_IDS");

  let appleRevenue = 0;
  let googleRevenue = 0;
  let revenueAttribution = "estimated_by_spend_share";

  if (appleAppIds.length > 0 || googleAppIds.length > 0) {
    const [appleMapped, googleMapped] = await Promise.all([
      revenueRepo.getNetRevenueByAppIds(startDate, endDate, appleAppIds),
      revenueRepo.getNetRevenueByAppIds(startDate, endDate, googleAppIds),
    ]);

    appleRevenue = appleMapped;
    googleRevenue = googleMapped;
    revenueAttribution = "mapped_by_revenuecat_app_ids";
  } else if (totalSpend > 0) {
    appleRevenue = totalRevenue * (appleSpend / totalSpend);
    googleRevenue = totalRevenue * (googleSpend / totalSpend);
  }

  const appleRoas = appleSpend > 0 ? appleRevenue / appleSpend : null;
  const googleRoas = googleSpend > 0 ? googleRevenue / googleSpend : null;
  const totalRoas = totalSpend > 0 ? totalRevenue / totalSpend : null;

  return {
    startDate,
    endDate,
    apple: {
      spend: appleSpend,
      revenue: appleRevenue,
      profit: appleRevenue - appleSpend,
      roas: appleRoas,
    },
    google: {
      spend: googleSpend,
      revenue: googleRevenue,
      profit: googleRevenue - googleSpend,
      roas: googleRoas,
    },
    total: {
      spend: totalSpend,
      revenue: totalRevenue,
      profit: totalRevenue - totalSpend,
      roas: totalRoas,
    },
    revenueAttribution,
  };
}

module.exports = {
  syncRevenueForDate,
  getRevenueReport,
  getSpendRevenueComparison,
  getPlatformSpendRevenueComparison,
};
