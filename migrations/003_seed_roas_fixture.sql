-- Seed fixture data for ROAS UI testing
-- Run once in local/dev only:
-- mysql -u user -p database < migrations/003_seed_roas_fixture.sql

INSERT INTO ad_metrics (
  platform,
  campaign_id,
  campaign_name,
  metric_date,
  clicks,
  impressions,
  cost,
  conversions,
  avg_cpt
)
VALUES
  ('apple', 'seed-apple-001', 'Seed Apple Campaign', '2026-02-23', 140, 9800, 86.50, 23, 0.62),
  ('apple', 'seed-apple-002', 'Seed Apple Retargeting', '2026-02-23', 95, 6200, 57.25, 14, 0.60),
  ('google', 'seed-google-001', 'Seed Google Search', '2026-02-23', 210, 15100, 124.00, 29, NULL),
  ('google', 'seed-google-002', 'Seed Google Display', '2026-02-23', 160, 24000, 98.30, 17, NULL)
ON DUPLICATE KEY UPDATE
  campaign_name = VALUES(campaign_name),
  clicks = VALUES(clicks),
  impressions = VALUES(impressions),
  cost = VALUES(cost),
  conversions = VALUES(conversions),
  avg_cpt = VALUES(avg_cpt),
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO revenue_metrics (
  source,
  app_id,
  app_name,
  metric_date,
  country_code,
  currency,
  gross_revenue,
  refunds,
  net_revenue,
  transactions
)
VALUES
  ('revenuecat', 'seed-app-001', 'PhotoVerse', '2026-02-23', NULL, 'USD', 520.00, 20.00, 500.00, 31)
ON DUPLICATE KEY UPDATE
  app_name = VALUES(app_name),
  gross_revenue = VALUES(gross_revenue),
  refunds = VALUES(refunds),
  net_revenue = VALUES(net_revenue),
  transactions = VALUES(transactions),
  updated_at = CURRENT_TIMESTAMP;
