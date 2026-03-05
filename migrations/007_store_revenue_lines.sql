-- Raw line-level store revenue data for auditability (SKU, transaction type, etc.)

CREATE TABLE IF NOT EXISTS store_revenue_lines (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  app_key VARCHAR(64) NOT NULL,
  store VARCHAR(20) NOT NULL COMMENT 'app_store | google_play',
  metric_date DATE NOT NULL,
  source VARCHAR(32) NOT NULL DEFAULT 'store_report',
  currency VARCHAR(8) DEFAULT NULL,
  buyer_currency VARCHAR(8) DEFAULT NULL,
  buyer_country VARCHAR(8) DEFAULT NULL,
  package_id VARCHAR(255) DEFAULT NULL,
  sku_id VARCHAR(255) DEFAULT NULL,
  product_title VARCHAR(512) DEFAULT NULL,
  product_type VARCHAR(64) DEFAULT NULL,
  transaction_type VARCHAR(128) DEFAULT NULL,
  refund_type VARCHAR(128) DEFAULT NULL,
  tax_type VARCHAR(64) DEFAULT NULL,
  sales_channel VARCHAR(64) DEFAULT NULL,
  gross_amount DECIMAL(14,4) NOT NULL DEFAULT 0,
  net_amount DECIMAL(14,4) NOT NULL DEFAULT 0,
  row_hash CHAR(64) NOT NULL,
  raw_json JSON DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_store_revenue_line_hash (app_key, store, row_hash),
  KEY idx_store_revenue_line_date (metric_date),
  KEY idx_store_revenue_line_app (app_key),
  KEY idx_store_revenue_line_sku (sku_id),
  CONSTRAINT fk_store_revenue_line_app
    FOREIGN KEY (app_key) REFERENCES apps(app_key)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
