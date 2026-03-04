-- Maps ad campaigns to internal app_key for app-level filters

CREATE TABLE IF NOT EXISTS campaign_app_mapping (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  platform VARCHAR(20) NOT NULL COMMENT 'apple | google',
  campaign_id VARCHAR(64) NOT NULL,
  app_key VARCHAR(64) NOT NULL,
  valid_from DATE DEFAULT NULL,
  valid_to DATE DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_campaign_app_period (platform, campaign_id, app_key, valid_from, valid_to),
  KEY idx_campaign_lookup (platform, campaign_id),
  KEY idx_app_key (app_key),
  CONSTRAINT fk_campaign_app_mapping_app
    FOREIGN KEY (app_key) REFERENCES apps(app_key)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
