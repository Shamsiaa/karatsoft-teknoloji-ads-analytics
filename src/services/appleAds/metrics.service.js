const { getCampaignsReport, getAdGroupsReport } = require("./api.client");

/**
 * Resolve granularity automatically based on date range.
 * Apple rejects large DAILY ranges (> ~90 days).
 */
function resolveGranularity(startDate, endDate, requestedGranularity) {
  if (requestedGranularity) return requestedGranularity;

  const start = new Date(startDate);
  const end = new Date(endDate);

  if (isNaN(start) || isNaN(end)) return "DAILY";

  const diffDays = (end - start) / (1000 * 60 * 60 * 24);

  if (diffDays < 0) {
    throw new Error("endDate must be greater than or equal to startDate");
  }

  return diffDays > 90 ? "SUMMARY" : "DAILY";
}

function pickAmount(x) {
  if (x == null) return 0;
  if (typeof x === "number") return x;
  if (typeof x === "string") {
    const n = Number(x);
    return Number.isFinite(n) ? n : 0;
  }
  if (typeof x === "object" && x.amount != null) {
    const n = Number(x.amount);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function normalizeMetricBlock(m) {
  if (!m || typeof m !== "object") {
    return {
      taps: 0,
      impressions: 0,
      spend: 0,
      installs: 0,
      avgCPT: 0,
      date: undefined,
      raw: m,
    };
  }

  return {
    taps: m.taps ?? 0,
    impressions: m.impressions ?? 0,
    spend: pickAmount(m.localSpend ?? m.spend),
    installs:
      m.totalInstalls ?? m.installs ?? m.tapInstalls ?? m.viewInstalls ?? 0,
    avgCPT: pickAmount(m.avgCPT ?? m.averageCPT),
    date: m.date,
    raw: m,
  };
}

/**
 * Extract metrics from Apple Ads report data.
 * Apple v5 wraps the report in data.reportingDataResponse.
 */
function extractMetrics(reportData) {
  if (!reportData || typeof reportData !== "object") return [];

  const payload = reportData.data?.reportingDataResponse ?? reportData;
  const rows = Array.isArray(payload.row) ? payload.row : null;

  if (rows) {
    const out = [];

    for (const r of rows) {
      const metadata = r?.metadata || {};
      const granularity = Array.isArray(r?.granularity)
        ? r.granularity
        : null;

      // DAILY breakdown
      if (granularity && granularity.length > 0) {
        for (const g of granularity) {
          const m = normalizeMetricBlock(g);
          out.push({
            campaignId: metadata.campaignId ?? metadata.campaign?.id,
            campaignName: metadata.campaignName ?? metadata.campaign?.name,
            adGroupId: metadata.adGroupId,
            adGroupName: metadata.adGroupName,
            date: m.date,
            taps: m.taps,
            impressions: m.impressions,
            spend: m.spend,
            installs: m.installs,
            avgCPT: m.avgCPT,
            metadata,
          });
        }
        continue;
      }

      // SUMMARY / TOTAL
      const total = r?.total || r?.grandTotals?.total;
      const m = normalizeMetricBlock(total);

      out.push({
        campaignId: metadata.campaignId ?? metadata.campaign?.id,
        campaignName: metadata.campaignName ?? metadata.campaign?.name,
        adGroupId: metadata.adGroupId,
        adGroupName: metadata.adGroupName,
        date: m.date,
        taps: m.taps,
        impressions: m.impressions,
        spend: m.spend,
        installs: m.installs,
        avgCPT: m.avgCPT,
        metadata,
      });
    }

    return out;
  }

  if (Array.isArray(reportData.data)) {
    return reportData.data.map((item) => {
      const m = normalizeMetricBlock(item);
      return {
        campaignId: item.campaignId || item.id,
        campaignName: item.campaignName || item.name,
        adGroupId: item.adGroupId,
        adGroupName: item.adGroupName,
        date: m.date,
        taps: m.taps,
        impressions: m.impressions,
        spend: m.spend,
        installs: m.installs,
        avgCPT: m.avgCPT,
        raw: item,
      };
    });
  }

  return [];
}

/**
 * Get campaigns metrics
 */
async function getCampaignsMetrics(startDate, endDate, options = {}) {
  try {
    const reportParams = {
      startTime: startDate,
      endTime: endDate,
      timeZone: options.timeZone || "UTC",
      returnRecordsWithNoMetrics: options.returnRecordsWithNoMetrics || false,
      returnRowTotals: options.returnRowTotals ?? true,
      selector: {
        orderBy: [{ field: "localSpend", sortOrder: "DESCENDING" }],
        pagination: {
          offset: options.offset || 0,
          limit: options.limit || 1000,
        },
      },
    };

    const reportData = await getCampaignsReport(reportParams);
    const metrics = extractMetrics(reportData);

    // ✅ Log each metric in UTC
    metrics.forEach((m) => {
      const utcDate = m.date;
      const localDate = new Date(utcDate).toString();
      console.log(
        `Campaign ${m.campaignName} | UTC: ${utcDate} | Local: ${localDate} | Taps: ${m.taps} | Spend: ${m.spend}`,
      );
    });

    if (options.debug) {
      return { metrics, rawResponse: reportData };
    }
    return metrics;
  } catch (error) {
    throw new Error(`Failed to get campaigns metrics: ${error.message}`);
  }
}

/**
 * Get ad groups metrics
 */
async function getAdGroupsMetrics(startDate, endDate, options = {}) {
  try {
    if (!options.campaignId) {
      throw new Error(
        "campaignId is required for ad group-level reports"
      );
    }

    const reportParams = {
      startTime: startDate,
      endTime: endDate,
      timeZone: options.timeZone || "UTC",
      returnRecordsWithNoMetrics:
        options.returnRecordsWithNoMetrics || false,
      returnRowTotals: options.returnRowTotals ?? true,
      selector: {
        orderBy: [
          {
            field: "localSpend",
            sortOrder: "DESCENDING",
          },
        ],
        pagination: {
          offset: options.offset || 0,
          limit: options.limit || 1000,
        },
      },
    };

    const reportData = await getAdGroupsReport(
      options.campaignId,
      reportParams
    );

    return extractMetrics(reportData);
  } catch (error) {
    throw new Error(`Failed to get ad groups metrics: ${error.message}`);
  }
}

module.exports = {
  extractMetrics,
  getCampaignsMetrics,
  getAdGroupsMetrics,
};