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

---

## 🌐 REST API Endpoints

### Ads report

- `GET /api/ads-report?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD[&platform=apple|google]`
- `POST /api/ads-report/sync?date=YYYY-MM-DD[&platform=apple|google|revenuecat|all]`

### Revenue report

- `GET /api/revenue-report?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD[&appId=...]`
- `POST /api/revenue-report/sync?date=YYYY-MM-DD`
- `GET /api/revenue-report/compare?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`

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
REVENUECAT_METRICS_PATH_TEMPLATE=/projects/{projectId}/metrics/overview?start_date={startDate}&end_date={endDate}&granularity=daily
```
