const pool = require("../config/db");

async function listMappings(appKey = null) {
  const conditions = [];
  const params = [];

  if (appKey) {
    conditions.push("app_key = ?");
    params.push(appKey);
  }

  const whereSql = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const [rows] = await pool.query(
    `
      SELECT
        id,
        platform,
        campaign_id AS campaignId,
        app_key AS appKey,
        valid_from AS validFrom,
        valid_to AS validTo
      FROM campaign_app_mapping
      ${whereSql}
      ORDER BY platform, campaign_id, valid_from, valid_to
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
    validFrom = null,
    validTo = null,
  } = mapping;

  await pool.query(
    `
      INSERT INTO campaign_app_mapping (
        platform, campaign_id, app_key, valid_from, valid_to
      ) VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        updated_at = CURRENT_TIMESTAMP
    `,
    [platform, String(campaignId), appKey, validFrom, validTo],
  );
}

module.exports = {
  listMappings,
  upsertMapping,
};
