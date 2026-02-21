# Karatsoft Ads Reporting System

An internal advertising performance tracking system that integrates with Google Ads API and Apple Search Ads API to automatically collect, store, and report campaign metrics.

---

## 📌 Project Overview

The Karatsoft Ads Reporting System is designed to automate the collection and reporting of campaign performance data from multiple advertising platforms.

The system eliminates manual monitoring and enables centralized daily/monthly performance tracking through a unified API.

---

## 🎯 Objective

Automatically fetch and report the following campaign metrics:

- Clicks
- Impressions
- Cost / Spend
- Conversions (if available)
- Key performance ratios such as CPI, CPC, CPM

The goal is to:
- Remove manual performance tracking
- Enable centralized reporting
- Provide a foundation for ROI analysis

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

---

### 🍎 Apple Search Ads API Integration

- Token-based authentication (ES256 JWT)
- Campaign and Ad Group level reporting
- Retrieved fields:
  - `taps`
  - `impressions`
  - `spend`
  - `installs`
  - `avgCPT`



## 🌐 REST API Endpoint

### GET `/api/ads-report?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`

### Example JSON Response

```json
{
  "platform": "google",
  "campaign": "PhotoVerse TR",
  "clicks": 1523,
  "impressions": 40211,
  "cost": 3450.75
}