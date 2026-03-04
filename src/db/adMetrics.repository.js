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
async function getAdsReport(startDate, endDate, platform = null, appKey = null) {
  const conditions = ["ad_metrics.metric_date BETWEEN ? AND ?"];
  const params = [startDate, endDate];
  const joins = [];

  if (platform) {
    conditions.push("ad_metrics.platform = ?");
    params.push(platform);
  }

  if (appKey) {
    joins.push(`
      JOIN campaign_app_mapping cam
        ON BINARY cam.platform = BINARY ad_metrics.platform
       AND BINARY cam.campaign_id = BINARY ad_metrics.campaign_id
       AND (cam.valid_from IS NULL OR ad_metrics.metric_date >= cam.valid_from)
       AND (cam.valid_to IS NULL OR ad_metrics.metric_date <= cam.valid_to)
    `);
    conditions.push("BINARY cam.app_key = BINARY ?");
    params.push(appKey);
  }

  const [rows] = await pool.query(
    `
    SELECT
      ad_metrics.platform AS platform,
      ad_metrics.campaign_name AS campaign,
      SUM(ad_metrics.clicks) AS clicks,
      SUM(ad_metrics.impressions) AS impressions,
      SUM(ad_metrics.cost) AS cost,
      SUM(ad_metrics.conversions) AS conversions
    FROM ad_metrics
    ${joins.join("\n")}
    WHERE ${conditions.join(" AND ")}
    GROUP BY ad_metrics.platform, ad_metrics.campaign_id, ad_metrics.campaign_name
    ORDER BY ad_metrics.platform, ad_metrics.campaign_name
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


async function getCostTotal(startDate, endDate, platform = null, appKey = null) {
  const conditions = ["ad_metrics.metric_date BETWEEN ? AND ?"];
  const params = [startDate, endDate];
  const joins = [];

  if (platform) {
    conditions.push("ad_metrics.platform = ?");
    params.push(platform);
  }

  if (appKey) {
    joins.push(`
      JOIN campaign_app_mapping cam
        ON BINARY cam.platform = BINARY ad_metrics.platform
       AND BINARY cam.campaign_id = BINARY ad_metrics.campaign_id
       AND (cam.valid_from IS NULL OR ad_metrics.metric_date >= cam.valid_from)
       AND (cam.valid_to IS NULL OR ad_metrics.metric_date <= cam.valid_to)
    `);
    conditions.push("BINARY cam.app_key = BINARY ?");
    params.push(appKey);
  }

  const [rows] = await pool.query(
    `
      SELECT COALESCE(SUM(ad_metrics.cost), 0) AS total
      FROM ad_metrics
      ${joins.join("\n")}
      WHERE ${conditions.join(" AND ")}
    `,
    params,
  );

  return Number(rows?.[0]?.total || 0);
}

async function getAdsDailyTrend(startDate, endDate, platform = null, appKey = null) {
  const conditions = ["ad_metrics.metric_date BETWEEN ? AND ?"];
  const params = [startDate, endDate];
  const joins = [];

  if (platform) {
    conditions.push("ad_metrics.platform = ?");
    params.push(platform);
  }

  if (appKey) {
    joins.push(`
      JOIN campaign_app_mapping cam
        ON BINARY cam.platform = BINARY ad_metrics.platform
       AND BINARY cam.campaign_id = BINARY ad_metrics.campaign_id
       AND (cam.valid_from IS NULL OR ad_metrics.metric_date >= cam.valid_from)
       AND (cam.valid_to IS NULL OR ad_metrics.metric_date <= cam.valid_to)
    `);
    conditions.push("BINARY cam.app_key = BINARY ?");
    params.push(appKey);
  }

  const [rows] = await pool.query(
    `
      SELECT
        ad_metrics.metric_date AS date,
        COALESCE(SUM(ad_metrics.clicks), 0) AS clicks,
        COALESCE(SUM(ad_metrics.impressions), 0) AS impressions,
        COALESCE(SUM(ad_metrics.cost), 0) AS cost,
        COALESCE(SUM(ad_metrics.conversions), 0) AS conversions
      FROM ad_metrics
      ${joins.join("\n")}
      WHERE ${conditions.join(" AND ")}
      GROUP BY ad_metrics.metric_date
      ORDER BY ad_metrics.metric_date
    `,
    params,
  );

  return rows.map((r) => ({
    date: new Date(r.date).toISOString().slice(0, 10),
    clicks: Number(r.clicks) || 0,
    impressions: Number(r.impressions) || 0,
    cost: Number(r.cost) || 0,
    conversions: Number(r.conversions) || 0,
  }));
}

module.exports = {
  upsertAdMetrics,
  getAdsReport,
  getCostTotal,
  getAdsDailyTrend,
};
