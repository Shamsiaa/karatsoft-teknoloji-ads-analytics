const pool = require("../config/db");

async function listApps() {
  const [rows] = await pool.query(
    `
      SELECT
        id,
        app_key AS appKey,
        app_name AS appName,
        ios_bundle_id AS iosBundleId,
        ios_sku AS iosSku,
        android_package_name AS androidPackageName,
        is_active AS isActive
      FROM apps
      ORDER BY app_name
    `,
  );
  return rows.map((r) => ({
    ...r,
    isActive: Boolean(r.isActive),
  }));
}

async function upsertApp(app) {
  const {
    appKey,
    appName,
    iosBundleId = null,
    iosSku = null,
    androidPackageName = null,
    isActive = true,
  } = app;

  await pool.query(
    `
      INSERT INTO apps (
        app_key, app_name, ios_bundle_id, ios_sku, android_package_name, is_active
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        app_name = VALUES(app_name),
        ios_bundle_id = VALUES(ios_bundle_id),
        ios_sku = VALUES(ios_sku),
        android_package_name = VALUES(android_package_name),
        is_active = VALUES(is_active),
        updated_at = CURRENT_TIMESTAMP
    `,
    [
      appKey,
      appName,
      iosBundleId,
      iosSku,
      androidPackageName,
      isActive ? 1 : 0,
    ],
  );
}

async function getAppByKey(appKey) {
  const [rows] = await pool.query(
    `
      SELECT
        id,
        app_key AS appKey,
        app_name AS appName,
        ios_bundle_id AS iosBundleId,
        ios_sku AS iosSku,
        android_package_name AS androidPackageName,
        is_active AS isActive
      FROM apps
      WHERE app_key = ?
      LIMIT 1
    `,
    [appKey],
  );

  const row = rows[0];
  if (!row) return null;
  return {
    ...row,
    isActive: Boolean(row.isActive),
  };
}

module.exports = {
  listApps,
  upsertApp,
  getAppByKey,
};
