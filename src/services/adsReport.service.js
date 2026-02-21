const { getCampaignsMetrics } = require("./appleAds/metrics.service");
const adMetricsRepo = require("../db/adMetrics.repository");

const PLATFORM_APPLE = "apple";

/**
 * Sync Apple Ads campaign metrics for a single day into ad_metrics.
 * Call with date = YYYY-MM-DD (e.g. yesterday for daily cron).
 */
async function syncAppleAdsForDate(date) {
  const metrics = await getCampaignsMetrics(date, date, { limit: 1000 });
  const saved = [];

  for (const m of metrics) {
    await adMetricsRepo.upsertAdMetrics({
      platform: PLATFORM_APPLE,
      campaign_id: String(m.campaignId),
      campaign_name: m.campaignName || null,
      metric_date: date,
      clicks: m.taps ?? 0,
      impressions: m.impressions ?? 0,
      cost: m.spend ?? 0,
      conversions: m.installs != null ? m.installs : null,
      avg_cpt: m.avgCPT != null ? m.avgCPT : null,
    });
    saved.push({ campaignId: m.campaignId, campaignName: m.campaignName });
  }

  return { date, platform: PLATFORM_APPLE, count: saved.length, campaigns: saved };
}

/**
 * Get unified ads report from DB for date range.
 * Optional filter by platform (apple | google).
 */
async function getAdsReport(startDate, endDate, platform = null) {
  return adMetricsRepo.getAdsReport(startDate, endDate, platform);
}

module.exports = {
  syncAppleAdsForDate,
  getAdsReport,
};
