const pool = require("../config/db");

const DEFAULT_SYNC_KEY = "all_sync";

async function ensureState(syncKey = DEFAULT_SYNC_KEY) {
  await pool.query(
    `
      INSERT INTO sync_state (sync_key, is_running)
      VALUES (?, 0)
      ON DUPLICATE KEY UPDATE
        sync_key = VALUES(sync_key)
    `,
    [syncKey],
  );
}

async function getState(syncKey = DEFAULT_SYNC_KEY) {
  await ensureState(syncKey);
  const [rows] = await pool.query(
    `
      SELECT
        sync_key AS syncKey,
        is_running AS isRunning,
        started_at AS startedAt,
        heartbeat_at AS heartbeatAt,
        finished_at AS finishedAt,
        cursor_date AS cursorDate,
        last_success_date AS lastSuccessDate,
        last_error AS lastError
      FROM sync_state
      WHERE sync_key = ?
      LIMIT 1
    `,
    [syncKey],
  );
  const row = rows[0] || null;
  if (!row) return null;
  return {
    ...row,
    isRunning: Boolean(row.isRunning),
    startedAt: row.startedAt ? new Date(row.startedAt).toISOString() : null,
    heartbeatAt: row.heartbeatAt ? new Date(row.heartbeatAt).toISOString() : null,
    finishedAt: row.finishedAt ? new Date(row.finishedAt).toISOString() : null,
    cursorDate: row.cursorDate ? new Date(row.cursorDate).toISOString().slice(0, 10) : null,
    lastSuccessDate: row.lastSuccessDate ? new Date(row.lastSuccessDate).toISOString().slice(0, 10) : null,
  };
}

async function tryAcquireLock(syncKey = DEFAULT_SYNC_KEY, staleMinutes = 120) {
  await ensureState(syncKey);
  const [result] = await pool.query(
    `
      UPDATE sync_state
      SET
        is_running = 1,
        started_at = UTC_TIMESTAMP(),
        heartbeat_at = UTC_TIMESTAMP(),
        finished_at = NULL,
        last_error = NULL
      WHERE sync_key = ?
        AND (
          is_running = 0
          OR heartbeat_at IS NULL
          OR heartbeat_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? MINUTE)
        )
    `,
    [syncKey, Number(staleMinutes) || 120],
  );
  return Number(result.affectedRows || 0) > 0;
}

async function heartbeat(syncKey = DEFAULT_SYNC_KEY) {
  await pool.query(
    `
      UPDATE sync_state
      SET heartbeat_at = UTC_TIMESTAMP()
      WHERE sync_key = ?
    `,
    [syncKey],
  );
}

async function setCursorDate(cursorDate, syncKey = DEFAULT_SYNC_KEY) {
  await pool.query(
    `
      UPDATE sync_state
      SET cursor_date = ?
      WHERE sync_key = ?
    `,
    [cursorDate, syncKey],
  );
}

async function setLastSuccessDate(lastSuccessDate, syncKey = DEFAULT_SYNC_KEY) {
  await pool.query(
    `
      UPDATE sync_state
      SET last_success_date = ?
      WHERE sync_key = ?
    `,
    [lastSuccessDate, syncKey],
  );
}

async function releaseLock({ lastError = null } = {}, syncKey = DEFAULT_SYNC_KEY) {
  await pool.query(
    `
      UPDATE sync_state
      SET
        is_running = 0,
        finished_at = UTC_TIMESTAMP(),
        heartbeat_at = UTC_TIMESTAMP(),
        last_error = ?
      WHERE sync_key = ?
    `,
    [lastError, syncKey],
  );
}

module.exports = {
  DEFAULT_SYNC_KEY,
  getState,
  tryAcquireLock,
  heartbeat,
  setCursorDate,
  setLastSuccessDate,
  releaseLock,
};
