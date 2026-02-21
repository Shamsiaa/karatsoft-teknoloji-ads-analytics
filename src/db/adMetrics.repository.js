const pool = require("../config/db");

/**
 * Upsert a row into ad_metrics (by platform, campaign_id, metric_date).
 * Used when syncing Apple/Google data.
 */
async function upsertAdMetrics(row) {
  const {
    platform,
    campaign_id: campaignId,
    campaign_name: campaignName,
    metric_date: metricDate,
    clicks = 0,
    impressions = 0,
    cost = 0,
    conversions = null,
    avg_cpt = null,
  } = row;

  await pool.query(
    `
    INSERT INTO ad_metrics (
      platform, campaign_id, campaign_name, metric_date,
      clicks, impressions, cost, conversions, avg_cpt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      campaign_name = VALUES(campaign_name),
      clicks = VALUES(clicks),
      impressions = VALUES(impressions),
      cost = VALUES(cost),
      conversions = VALUES(conversions),
      avg_cpt = VALUES(avg_cpt),
      updated_at = CURRENT_TIMESTAMP
    `,
    [
      platform,
      String(campaignId),
      campaignName || null,
      metricDate,
      Number(clicks) || 0,
      Number(impressions) || 0,
      Number(cost) || 0,
      conversions != null ? Number(conversions) : null,
      avg_cpt != null ? Number(avg_cpt) : null,
    ]
  );
}

/**
 * Get aggregated ads report for date range.
 * Returns one row per platform + campaign with summed metrics.
 * Format: { platform, campaign, clicks, impressions, cost, conversions? }
 */
async function getAdsReport(startDate, endDate, platform = null) {
  const conditions = ["metric_date BETWEEN ? AND ?"];
  const params = [startDate, endDate];

  if (platform) {
    conditions.push("platform = ?");
    params.push(platform);
  }

  const [rows] = await pool.query(
    `
    SELECT
      platform AS platform,
      campaign_name AS campaign,
      SUM(clicks) AS clicks,
      SUM(impressions) AS impressions,
      SUM(cost) AS cost,
      SUM(conversions) AS conversions
    FROM ad_metrics
    WHERE ${conditions.join(" AND ")}
    GROUP BY platform, campaign_id, campaign_name
    ORDER BY platform, campaign_name
    `,
    params
  );

  return rows.map((r) => ({
    platform: r.platform,
    campaign: r.campaign || "",
    clicks: Number(r.clicks) || 0,
    impressions: Number(r.impressions) || 0,
    cost: Number(r.cost) || 0,
    ...(r.conversions != null && { conversions: Number(r.conversions) }),
  }));
}

module.exports = {
  upsertAdMetrics,
  getAdsReport,
};
