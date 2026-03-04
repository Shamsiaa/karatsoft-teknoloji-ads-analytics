# Karatsoft Ads Reporting System

An internal advertising performance tracking system that integrates with Google Ads API, Apple Search Ads API, and RevenueCat API to automatically collect, store, and report campaign + mobile revenue metrics.

---

## 📌 Project Overview

The Karatsoft Ads Reporting System automates data collection from multiple platforms and stores normalized daily records in MySQL.

It eliminates manual platform-by-platform checks and enables centralized daily/monthly analysis.

---

## 🎯 Objective

Automatically fetch and report:

- Ad spend metrics (clicks, impressions, cost, conversions)
- Mobile app purchase revenue metrics (gross, refunds, net revenue)
- Comparison metrics such as profit and ROAS

---

## 📊 Scope

### 🔵 Google Ads API Integration

- OAuth2 authentication setup
- Campaign-level data retrieval using Customer ID
- Retrieved fields:
  - `campaign.name`
  - `metrics.clicks`
  - `metrics.impressions`
  - `metrics.cost_micros`
  - `metrics.conversions`
  - `segments.date`
- Daily data synchronization

### 🍎 Apple Search Ads API Integration

- Token-based authentication (ES256 JWT)
- Campaign and Ad Group level reporting
- Retrieved fields:
  - `taps`
  - `impressions`
  - `spend`
  - `installs`
  - `avgCPT`

### 💰 RevenueCat Integration

- Server-side API key authentication (`REVENUECAT_API_KEY`)
- Daily revenue sync into `revenue_metrics`
- Normalized fields:
  - `app_id`
  - `metric_date`
  - `gross_revenue`
  - `refunds`
  - `net_revenue`
  - `transactions`

> Note: RevenueCat endpoint path is configurable through `REVENUECAT_METRICS_PATH_TEMPLATE` to support API-version differences.

### ⏰ Daily Scheduler

- Built-in worker syncs **Apple Ads + RevenueCat** once per day.
- Runs on server start and schedules next run at a configured UTC time.
- Configurable via:
  - `DAILY_SYNC_ENABLED=true|false`
  - `DAILY_SYNC_TIME_UTC=HH:mm`
  - `DAILY_SYNC_RUN_ON_STARTUP=true|false`

---

## 🌐 REST API Endpoints

### Ads report

- `GET /api/ads-report?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD[&platform=apple|google][&appKey=photoverse]`
- `GET /api/ads-report/live?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD[&platform=apple|google]`
- `POST /api/ads-report/sync?date=YYYY-MM-DD[&platform=apple|google|revenuecat|all]`
  - Also supports range sync: `POST /api/ads-report/sync?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD[&platform=...]`

### Revenue report

- `GET /api/revenue-report?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD[&appId=...]`
- `POST /api/revenue-report/sync?date=YYYY-MM-DD`
- `GET /api/revenue-report/compare?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD[&appKey=photoverse]`
- `GET /api/revenue-report/platform-compare?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD[&appKey=photoverse]`

### Apps, Mapping, Store Revenue

- `GET /api/apps`
- `POST /api/apps`
- `GET /api/apps/campaign-mappings[?appKey=photoverse]`
- `POST /api/apps/campaign-mappings`
- `POST /api/apps/store-revenue/import`
- `POST /api/apps/store-revenue/import/app-store-csv`
- `POST /api/apps/store-revenue/import/google-play-csv`
- `POST /api/apps/store-revenue/sync?appKey=photoverse&date=YYYY-MM-DD[&store=app_store|google_play|all]`
- `POST /api/apps/store-revenue/sync-range?appKey=photoverse&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD[&store=app_store|google_play|all]`

`/compare` returns high-level totals:

```json
{
  "startDate": "2026-02-01",
  "endDate": "2026-02-23",
  "spend": 1234.56,
  "revenue": 1789.12,
  "profit": 554.56,
  "roas": 1.449
}
```

---

## 🔐 Required Environment Variables

- `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- Google Ads variables (existing)
- Apple Ads variables (existing)
- RevenueCat variables:
  - `REVENUECAT_API_KEY`
  - `REVENUECAT_PROJECT_ID` (required when using default metrics path)
  - `REVENUECAT_API_BASE_URL` (optional, default: `https://api.revenuecat.com/v2`)
  - `REVENUECAT_METRICS_PATH_TEMPLATE` (optional)

Template example:

```bash
REVENUECAT_METRICS_PATH_TEMPLATE=/projects/{projectId}/metrics/overview
```

Scheduler example:

```bash
DAILY_SYNC_ENABLED=true
DAILY_SYNC_TIME_UTC=02:00
DAILY_SYNC_RUN_ON_STARTUP=false
```

---

## 🗃️ Database Setup

Run migrations in order:

```bash
mysql -u user -p database < migrations/001_ad_metrics.sql
mysql -u user -p database < migrations/002_revenue_metrics.sql
mysql -u user -p database < migrations/004_apps.sql
mysql -u user -p database < migrations/005_campaign_app_mapping.sql
mysql -u user -p database < migrations/006_store_revenue_metrics.sql
```

Optional local fixture seed for non-zero ROAS testing:

```bash
mysql -u user -p database < migrations/003_seed_roas_fixture.sql
```

---

## 🖥️ Frontend (React + Tailwind)

A minimal dashboard UI is available under `client/`.

Run:

```bash
cd client
npm install
npm run dev
```

Optional frontend env:

```bash
VITE_API_BASE_URL=http://localhost:3000
```

Current UI includes:
- Date preset + platform filters
- KPI cards (Clicks, Impressions, Spend, Conversions, CPC, CPM)
- Campaign performance table from `/api/ads-report`
- Revenue/ROAS summary from `/api/revenue-report/compare`
- Platform spend/revenue blocks (Apple, Google, Total) from `/api/revenue-report/platform-compare`
- Scheduler status from `/api/system/scheduler-status`

Platform revenue attribution behavior:
- Preferred: import direct store financial data to `store_revenue_metrics` (`app_store` / `google_play`).
- Fallback 1: RevenueCat app-id mapping (`REVENUECAT_APPLE_APP_IDS` / `REVENUECAT_GOOGLE_APP_IDS`).
- Fallback 2: spend-share estimate if no direct platform revenue exists.

CSV connector notes:
- App Store / Google Play exported report text can be sent as `csvText`.
- Parser supports common headers (date, net revenue, gross, refunds, taxes, fees, currency, units).
- Rows with invalid dates are skipped and reported in response.

Direct connector notes:
- App Store Connect connector uses `/v1/salesReports` and requires:
  - `APP_STORE_CONNECT_ISSUER_ID`
  - `APP_STORE_CONNECT_KEY_ID`
  - `APP_STORE_CONNECT_PRIVATE_KEY_PATH`
  - `APP_STORE_CONNECT_VENDOR_NUMBER`
- Google Play connector reads financial report CSVs from Cloud Storage via service account:
  - `GOOGLE_PLAY_SERVICE_ACCOUNT_KEY_PATH`
  - `GOOGLE_PLAY_REPORTS_BUCKET`
  - `GOOGLE_PLAY_REPORTS_PREFIX`

Daily automation:
- Enable with `DAILY_STORE_REVENUE_SYNC_ENABLED=true`
- Set apps list with `STORE_REVENUE_SYNC_APP_KEYS=photoverse,another_app`
