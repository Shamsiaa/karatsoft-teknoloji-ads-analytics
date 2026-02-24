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

module.exports = {
  syncRevenueForDate,
  getRevenueReport,
  getSpendRevenueComparison,
};
