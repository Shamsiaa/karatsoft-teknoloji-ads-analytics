-- Currency master + daily historical exchange rates.
-- Base logic in app: fetch from Frankfurter using from=TRY and configurable target currency (default USD).

CREATE TABLE IF NOT EXISTS currencies (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  currency_code CHAR(3) NOT NULL UNIQUE,
  currency_name VARCHAR(50) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS exchange_rates (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  currency_id INT UNSIGNED NOT NULL,
  rate_date DATE NOT NULL,
  -- 1 TRY -> target currency (example USD 0.02828)
  exchange_rate DECIMAL(19,8) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_exchange_rate_day (currency_id, rate_date),
  CONSTRAINT fk_exchange_rate_currency
    FOREIGN KEY (currency_id) REFERENCES currencies(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
