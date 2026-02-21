-- Normalized ad metrics table for Apple Ads & Google Ads
-- Run once: mysql -u user -p database < migrations/001_ad_metrics.sql

CREATE TABLE IF NOT EXISTS ad_metrics (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  platform VARCHAR(20) NOT NULL COMMENT 'apple | google',
  campaign_id VARCHAR(64) NOT NULL COMMENT 'External campaign ID from the ad platform',
  campaign_name VARCHAR(255) DEFAULT NULL,
  metric_date DATE NOT NULL COMMENT 'Date of the metrics (YYYY-MM-DD)',
  clicks INT UNSIGNED DEFAULT 0 COMMENT 'Taps for Apple, clicks for Google',
  impressions INT UNSIGNED DEFAULT 0,
  cost DECIMAL(14, 4) DEFAULT 0 COMMENT 'Spend (Apple) or cost (Google)',
  conversions DECIMAL(14, 4) DEFAULT NULL COMMENT 'Installs (Apple) or conversions (Google)',
  avg_cpt DECIMAL(14, 4) DEFAULT NULL COMMENT 'Average cost per tap/click',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_platform_campaign_date (platform, campaign_id, metric_date),
  KEY idx_platform_date (platform, metric_date),
  KEY idx_metric_date (metric_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
