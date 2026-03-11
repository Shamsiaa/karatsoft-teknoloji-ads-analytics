# Karatsoft Ads Reporting System

Internal advertising performance tracking system that integrates with **Google Ads**, **Apple Search Ads**, **App Store Connect**, and **Google Play** to collect, store, and report campaign + store revenue metrics.

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

### 💰 Store Revenue (Direct)

- **App Store Connect** financial reports (`/v1/salesReports`)
- **Google Play** financial reports from Cloud Storage CSVs
- Raw lines stored in `store_revenue_lines` (no conversion)
- Daily summary in `store_revenue_metrics`

### ⏰ Daily Scheduler

- Built-in worker syncs **Apple Ads + Google Ads + Store Revenue + FX** once per day.
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
- `GET /api/ads-report/coverage?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD[&platform=apple|google][&appKey=photoverse]`
- `POST /api/ads-report/sync?date=YYYY-MM-DD[&platform=apple|google|all]`
  - Also supports range sync: `POST /api/ads-report/sync?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD[&platform=...]`

### Revenue report

- `GET /api/revenue-report/compare?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD[&appKey=photoverse]`
- `GET /api/revenue-report/platform-compare?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD[&appKey=photoverse]`
- `GET /api/revenue-report/platform-compare-normalized?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD[&appKey=photoverse]&targetCurrency=USD`
- `GET /api/revenue-report/platform-revenue-raw?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD[&appKey=photoverse]`
- `GET /api/revenue-report/coverage?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD[&appKey=photoverse]`

### Apps, Mapping, Store Revenue

- `GET /api/apps`
- `POST /api/apps`
- `GET /api/apps/ad-campaigns`
- `POST /api/apps/campaign-mappings`
- `POST /api/apps/store-revenue/import`
- `POST /api/apps/store-revenue/import/app-store-csv`
- `POST /api/apps/store-revenue/import/google-play-csv`
- `POST /api/apps/store-revenue/sync?appKey=photoverse&date=YYYY-MM-DD[&store=app_store|google_play|all]`
- `POST /api/apps/store-revenue/sync-range?appKey=photoverse&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD[&store=app_store|google_play|all]`

### System / Sync

- `GET /api/system/scheduler-status`
- `GET /api/system/sync-state`
- `POST /api/system/sync/all` (priority: today + yesterday, then backfill chunk)
- `POST /api/system/exchange-rates/sync?date=YYYY-MM-DD[&currency=USD]`
- `GET /api/system/exchange-rates?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD[&currency=USD]`
- `GET /api/system/google-ads/debug?date=YYYY-MM-DD`
- `GET /api/system/google-ads/debug-cost?date=YYYY-MM-DD`

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
- Google Ads variables:
  - `GOOGLE_ADS_CLIENT_ID`
  - `GOOGLE_ADS_CLIENT_SECRET`
  - `GOOGLE_ADS_REFRESH_TOKEN`
  - `GOOGLE_ADS_DEVELOPER_TOKEN`
  - `GOOGLE_ADS_CUSTOMER_ID`
  - `GOOGLE_ADS_LOGIN_CUSTOMER_ID` (optional, for MCC)
  - `GOOGLE_ADS_API_VERSION` (default: v22)
- Apple Search Ads variables:
  - `APPLE_TEAM_ID`
  - `APPLE_CLIENT_ID`
  - `APPLE_KEY_ID`
  - `APPLE_PRIVATE_KEY_PATH`
  - `APPLE_ADS_ORG_ID`
- App Store Connect:
  - `APP_STORE_CONNECT_ISSUER_ID`
  - `APP_STORE_CONNECT_KEY_ID`
  - `APP_STORE_CONNECT_PRIVATE_KEY_PATH`
  - `APP_STORE_CONNECT_VENDOR_NUMBER`
- Google Play:
  - `GOOGLE_PLAY_SERVICE_ACCOUNT_KEY_PATH`
  - `GOOGLE_PLAY_REPORTS_BUCKET`
  - `GOOGLE_PLAY_REPORTS_PREFIX` (default `earnings/`)
- Exchange rates:
  - `EXCHANGE_RATE_TARGET_CURRENCY` (default `USD`)

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
mysql -u user -p database < migrations/004_apps.sql
mysql -u user -p database < migrations/009_ad_campaigns_and_app_rel.sql
mysql -u user -p database < migrations/006_store_revenue_metrics.sql
mysql -u user -p database < migrations/007_store_revenue_lines.sql
mysql -u user -p database < migrations/008_exchange_rates.sql
mysql -u user -p database < migrations/010_sync_state.sql
mysql -u user -p database < migrations/011_remove_revenuecat.sql
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
- Currency filter (USD/TRY using stored exchange rates)
- KPI cards (Clicks, Impressions, Spend, Conversions, CPC, CPM)
- Campaign performance table from `/api/ads-report`
- Platform revenue blocks from `/api/revenue-report/platform-revenue-raw`
- Scheduler status from `/api/system/scheduler-status`
- Coverage cards from `/api/ads-report/coverage` and `/api/revenue-report/coverage`

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
