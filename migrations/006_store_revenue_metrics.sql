-- Direct store revenue source (App Store Connect / Google Play reports)

CREATE TABLE IF NOT EXISTS store_revenue_metrics (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  app_key VARCHAR(64) NOT NULL,
  store VARCHAR(20) NOT NULL COMMENT 'app_store | google_play',
  metric_date DATE NOT NULL,
  currency VARCHAR(8) NOT NULL DEFAULT 'USD',
  gross_revenue DECIMAL(14,4) NOT NULL DEFAULT 0,
  refunds DECIMAL(14,4) NOT NULL DEFAULT 0,
  taxes DECIMAL(14,4) NOT NULL DEFAULT 0,
  fees DECIMAL(14,4) NOT NULL DEFAULT 0,
  net_revenue DECIMAL(14,4) NOT NULL DEFAULT 0,
  transactions INT UNSIGNED DEFAULT 0,
  source VARCHAR(32) NOT NULL DEFAULT 'store_report',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_store_revenue_day (app_key, store, metric_date, currency, source),
  KEY idx_store_revenue_date (metric_date),
  KEY idx_store_revenue_app (app_key),
  CONSTRAINT fk_store_revenue_app
    FOREIGN KEY (app_key) REFERENCES apps(app_key)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
