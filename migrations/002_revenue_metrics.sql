-- Daily revenue metrics from RevenueCat
-- Run once: mysql -u user -p database < migrations/002_revenue_metrics.sql

CREATE TABLE IF NOT EXISTS revenue_metrics (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  source VARCHAR(32) NOT NULL DEFAULT 'revenuecat',
  app_id VARCHAR(128) NOT NULL,
  app_name VARCHAR(255) DEFAULT NULL,
  metric_date DATE NOT NULL,
  country_code VARCHAR(8) DEFAULT NULL,
  currency VARCHAR(8) DEFAULT 'USD',
  gross_revenue DECIMAL(14,4) NOT NULL DEFAULT 0,
  refunds DECIMAL(14,4) NOT NULL DEFAULT 0,
  net_revenue DECIMAL(14,4) NOT NULL DEFAULT 0,
  transactions INT UNSIGNED DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_revenue_source_app_date_country_currency (
    source,
    app_id,
    metric_date,
    country_code,
    currency
  ),
  KEY idx_revenue_metric_date (metric_date),
  KEY idx_revenue_app_date (app_id, metric_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
