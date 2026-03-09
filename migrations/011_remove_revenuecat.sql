-- Remove RevenueCat artifacts from schema.

DROP TABLE IF EXISTS revenue_metrics;

ALTER TABLE apps
  DROP COLUMN IF EXISTS revenuecat_ios_app_id,
  DROP COLUMN IF EXISTS revenuecat_android_app_id;
