const { getCampaignsMetrics } = require("./appleAds/metrics.service");
const { getGoogleCampaignDailyMetrics } = require("./googleAds/api.client");
const adMetricsRepo = require("../db/adMetrics.repository");

const PLATFORM_APPLE = "apple";
const PLATFORM_GOOGLE = "google";

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
 * Sync Google Ads campaign metrics for a single day into ad_metrics.
 * Uses Google Ads API (GAQL searchStream).
 */
async function syncGoogleAdsForDate(date) {
  const metrics = await getGoogleCampaignDailyMetrics(date, date);
  const saved = [];

  for (const m of metrics) {
    await adMetricsRepo.upsertAdMetrics({
      platform: PLATFORM_GOOGLE,
      campaign_id: String(m.campaignId),
      campaign_name: m.campaignName || null,
      metric_date: m.date || date,
      clicks: m.clicks ?? 0,
      impressions: m.impressions ?? 0,
      cost: m.cost ?? 0,
      conversions: m.conversions != null ? m.conversions : null,
      avg_cpt: null,
    });
    saved.push({ campaignId: m.campaignId, campaignName: m.campaignName });
  }

  return { date, platform: PLATFORM_GOOGLE, count: saved.length, campaigns: saved };
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
  syncGoogleAdsForDate,
  getAdsReport,
};
