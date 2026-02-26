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

- `GET /api/ads-report?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD[&platform=apple|google]`
- `POST /api/ads-report/sync?date=YYYY-MM-DD[&platform=apple|google|revenuecat|all]`

### Revenue report

- `GET /api/revenue-report?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD[&appId=...]`
- `POST /api/revenue-report/sync?date=YYYY-MM-DD`
- `GET /api/revenue-report/compare?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`
- `GET /api/revenue-report/platform-compare?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`

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
- Preferred: set `REVENUECAT_APPLE_APP_IDS` and `REVENUECAT_GOOGLE_APP_IDS` (comma-separated app IDs) for direct RevenueCat app mapping.
- Fallback: if mapping vars are not set, backend estimates Apple/Google revenue split by spend share.
