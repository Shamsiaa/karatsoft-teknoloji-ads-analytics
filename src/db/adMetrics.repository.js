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
      INSERT INTO ad_campaigns (
        platform, external_campaign_id, campaign_name
      ) VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE
        campaign_name = COALESCE(VALUES(campaign_name), campaign_name),
        updated_at = CURRENT_TIMESTAMP
    `,
    [platform, String(campaignId), campaignName || null],
  );

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
      JOIN ad_campaigns ac
        ON BINARY ac.platform = BINARY ad_metrics.platform
       AND BINARY ac.external_campaign_id = BINARY ad_metrics.campaign_id
      JOIN app_ad_campaign_map m
        ON m.ad_campaign_id = ac.id
      JOIN apps a
        ON a.id = m.app_id
    `);
    conditions.push("BINARY a.app_key = BINARY ?");
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
      JOIN ad_campaigns ac
        ON BINARY ac.platform = BINARY ad_metrics.platform
       AND BINARY ac.external_campaign_id = BINARY ad_metrics.campaign_id
      JOIN app_ad_campaign_map m
        ON m.ad_campaign_id = ac.id
      JOIN apps a
        ON a.id = m.app_id
    `);
    conditions.push("BINARY a.app_key = BINARY ?");
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
      JOIN ad_campaigns ac
        ON BINARY ac.platform = BINARY ad_metrics.platform
       AND BINARY ac.external_campaign_id = BINARY ad_metrics.campaign_id
      JOIN app_ad_campaign_map m
        ON m.ad_campaign_id = ac.id
      JOIN apps a
        ON a.id = m.app_id
    `);
    conditions.push("BINARY a.app_key = BINARY ?");
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

async function getAdsCoverage(startDate, endDate, platform = null, appKey = null) {
  const conditions = ["ad_metrics.metric_date BETWEEN ? AND ?"];
  const params = [startDate, endDate];
  const joins = [];

  if (platform) {
    conditions.push("ad_metrics.platform = ?");
    params.push(platform);
  }

  if (appKey) {
    joins.push(`
      JOIN ad_campaigns ac
        ON BINARY ac.platform = BINARY ad_metrics.platform
       AND BINARY ac.external_campaign_id = BINARY ad_metrics.campaign_id
      JOIN app_ad_campaign_map m
        ON m.ad_campaign_id = ac.id
      JOIN apps a
        ON a.id = m.app_id
    `);
    conditions.push("BINARY a.app_key = BINARY ?");
    params.push(appKey);
  }

  const [rows] = await pool.query(
    `
      SELECT
        MIN(ad_metrics.metric_date) AS minDate,
        MAX(ad_metrics.metric_date) AS maxDate,
        COUNT(DISTINCT ad_metrics.metric_date) AS daysWithData,
        COUNT(*) AS rowCount,
        COUNT(DISTINCT ad_metrics.campaign_id) AS campaignCount,
        COALESCE(SUM(ad_metrics.cost), 0) AS totalCost
      FROM ad_metrics
      ${joins.join("\n")}
      WHERE ${conditions.join(" AND ")}
    `,
    params,
  );

  const row = rows?.[0] || {};
  return {
    minDate: row.minDate ? new Date(row.minDate).toISOString().slice(0, 10) : null,
    maxDate: row.maxDate ? new Date(row.maxDate).toISOString().slice(0, 10) : null,
    daysWithData: Number(row.daysWithData) || 0,
    rowCount: Number(row.rowCount) || 0,
    campaignCount: Number(row.campaignCount) || 0,
    totalCost: Number(row.totalCost) || 0,
  };
}

module.exports = {
  upsertAdMetrics,
  getAdsReport,
  getCostTotal,
  getAdsDailyTrend,
  getAdsCoverage,
};
