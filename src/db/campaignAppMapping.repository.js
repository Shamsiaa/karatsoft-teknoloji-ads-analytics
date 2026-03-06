const pool = require("../config/db");

async function listMappings(appKey = null) {
  const conditions = [];
  const params = [];

  if (appKey) {
    conditions.push("a.app_key = ?");
    params.push(appKey);
  }

  const whereSql = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const [rows] = await pool.query(
    `
      SELECT
        m.id,
        a.id AS appId,
        a.app_key AS appKey,
        ac.id AS adCampaignId,
        ac.platform AS platform,
        ac.external_campaign_id AS campaignId,
        ac.campaign_name AS campaignName
      FROM app_ad_campaign_map m
      JOIN apps a ON a.id = m.app_id
      JOIN ad_campaigns ac ON ac.id = m.ad_campaign_id
      ${whereSql}
      ORDER BY ac.platform, ac.external_campaign_id
    `,
    params,
  );

  return rows;
}

async function upsertMapping(mapping) {
  const {
    platform,
    campaignId,
    appKey,
    campaignName = null,
  } = mapping;

  const [appRows] = await pool.query(
    `
      SELECT id
      FROM apps
      WHERE app_key = ?
      LIMIT 1
    `,
    [appKey],
  );
  const app = appRows[0];
  if (!app) {
    throw new Error(`App not found for appKey=${appKey}`);
  }

  await pool.query(
    `
      INSERT INTO ad_campaigns (
        platform, external_campaign_id, campaign_name
      ) VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE
        campaign_name = COALESCE(VALUES(campaign_name), campaign_name),
        updated_at = CURRENT_TIMESTAMP
    `,
    [platform, String(campaignId), campaignName],
  );

  const [campaignRows] = await pool.query(
    `
      SELECT id
      FROM ad_campaigns
      WHERE platform = ? AND external_campaign_id = ?
      LIMIT 1
    `,
    [platform, String(campaignId)],
  );
  const campaign = campaignRows[0];
  if (!campaign) {
    throw new Error(`Ad campaign not found after upsert for ${platform}:${campaignId}`);
  }

  await pool.query(
    `
      INSERT INTO app_ad_campaign_map (
        app_id, ad_campaign_id
      ) VALUES (?, ?)
      ON DUPLICATE KEY UPDATE
        app_id = VALUES(app_id)
    `,
    [app.id, campaign.id],
  );
}

async function upsertMappingByIds(appId, adCampaignId) {
  await pool.query(
    `
      INSERT INTO app_ad_campaign_map (
        app_id, ad_campaign_id
      ) VALUES (?, ?)
      ON DUPLICATE KEY UPDATE
        app_id = VALUES(app_id)
    `,
    [Number(appId), Number(adCampaignId)],
  );
}

module.exports = {
  listMappings,
  upsertMapping,
  upsertMappingByIds,
  listAdCampaigns: async function listAdCampaigns(platform = null) {
    const conditions = [];
    const params = [];
    if (platform) {
      conditions.push("ac.platform = ?");
      params.push(platform);
    }
    const whereSql = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const [rows] = await pool.query(
      `
        SELECT
          ac.id AS adCampaignId,
          ac.platform,
          ac.external_campaign_id AS campaignId,
          ac.campaign_name AS campaignName,
          a.id AS appId,
          a.app_key AS appKey,
          a.app_name AS appName
        FROM ad_campaigns ac
        LEFT JOIN app_ad_campaign_map m ON m.ad_campaign_id = ac.id
        LEFT JOIN apps a ON a.id = m.app_id
        ${whereSql}
        ORDER BY ac.platform, ac.external_campaign_id
      `,
      params,
    );

    return rows;
  },
};
