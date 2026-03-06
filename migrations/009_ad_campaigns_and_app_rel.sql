-- Mentor model:
-- - ad campaigns in separate table
-- - app/ad relation table with app_id + ad_campaign_id only
-- - one ad campaign maps to only one app

CREATE TABLE IF NOT EXISTS ad_campaigns (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  platform VARCHAR(20) NOT NULL COMMENT 'apple | google',
  external_campaign_id VARCHAR(64) NOT NULL,
  campaign_name VARCHAR(255) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_platform_external_campaign (platform, external_campaign_id),
  KEY idx_campaign_name (campaign_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_ad_campaign_map (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  app_id INT UNSIGNED NOT NULL,
  ad_campaign_id INT UNSIGNED NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ad_campaign_single_app (ad_campaign_id),
  UNIQUE KEY uq_app_campaign_pair (app_id, ad_campaign_id),
  KEY idx_app_id (app_id),
  CONSTRAINT fk_app_ad_campaign_map_app
    FOREIGN KEY (app_id) REFERENCES apps(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_app_ad_campaign_map_ad_campaign
    FOREIGN KEY (ad_campaign_id) REFERENCES ad_campaigns(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

