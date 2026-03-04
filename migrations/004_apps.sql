-- Application registry used for app-level filtering across ads and revenue

CREATE TABLE IF NOT EXISTS apps (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  app_key VARCHAR(64) NOT NULL,
  app_name VARCHAR(255) NOT NULL,
  ios_bundle_id VARCHAR(128) DEFAULT NULL,
  android_package_name VARCHAR(128) DEFAULT NULL,
  revenuecat_ios_app_id VARCHAR(64) DEFAULT NULL,
  revenuecat_android_app_id VARCHAR(64) DEFAULT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_app_key (app_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
