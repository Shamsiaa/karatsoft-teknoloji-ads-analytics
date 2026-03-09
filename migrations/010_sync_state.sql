-- Persistent sync lock/cursor state for externally triggered orchestrator endpoint.

CREATE TABLE IF NOT EXISTS sync_state (
  sync_key VARCHAR(64) PRIMARY KEY,
  is_running TINYINT(1) NOT NULL DEFAULT 0,
  started_at DATETIME DEFAULT NULL,
  heartbeat_at DATETIME DEFAULT NULL,
  finished_at DATETIME DEFAULT NULL,
  cursor_date DATE DEFAULT NULL,
  last_success_date DATE DEFAULT NULL,
  last_error TEXT DEFAULT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
