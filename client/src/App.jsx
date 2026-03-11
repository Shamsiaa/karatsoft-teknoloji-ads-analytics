import React, { useEffect, useMemo, useState } from "react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";
const DEBUG_LOGS = String(import.meta.env.VITE_DEBUG_LOGS || "false").toLowerCase() === "true";

function debugLog(event, payload) {
  if (!DEBUG_LOGS) return;
  // eslint-disable-next-line no-console
  console.log(`[dashboard] ${event}`, payload);
}

function toYmd(date) {
  return date.toISOString().slice(0, 10);
}

function fromYmd(ymd) {
  return new Date(`${ymd}T00:00:00Z`);
}

function getRangeFromPreset(preset) {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(end.getUTCDate() - (preset === "7d" ? 6 : 29));
  return { startDate: toYmd(start), endDate: toYmd(end) };
}

function getPreviousRange(startDate, endDate) {
  const start = fromYmd(startDate);
  const end = fromYmd(endDate);
  const days = Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1;

  const prevEnd = new Date(start);
  prevEnd.setUTCDate(prevEnd.getUTCDate() - 1);

  const prevStart = new Date(prevEnd);
  prevStart.setUTCDate(prevStart.getUTCDate() - (days - 1));

  return { startDate: toYmd(prevStart), endDate: toYmd(prevEnd) };
}

function formatNumber(value) {
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(value || 0);
}

function formatCurrency(value, currencyCode = "USD") {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: currencyCode,
    maximumFractionDigits: 2,
  }).format(value || 0);
}

function formatCurrencyCode(value, currencyCode) {
  try {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency: currencyCode || "USD",
      maximumFractionDigits: 2,
    }).format(value || 0);
  } catch (_err) {
    return `${formatNumber(value)} ${currencyCode || "UNK"}`;
  }
}

function getPlatformCurrency(platform) {
  if (platform === "google") return "TRY";
  if (platform === "apple") return "USD";
  return "USD";
}

function percentChange(current, previous) {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
}

function downloadCsv(rows) {
  const headers = ["platform", "campaign", "clicks", "impressions", "cost", "conversions", "cpc", "cpm"];
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.platform,
        `"${String(r.campaign || "").replace(/"/g, '""')}"`,
        r.clicks || 0,
        r.impressions || 0,
        r.cost || 0,
        r.conversions ?? "",
        r.cpc || 0,
        r.cpm || 0,
      ].join(","),
    );
  }

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "kampanya-raporu.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function sumTotals(rows) {
  return rows.reduce(
    (acc, row) => {
      acc.clicks += Number(row.clicks) || 0;
      acc.impressions += Number(row.impressions) || 0;
      acc.spend += Number(row.cost) || 0;
      acc.conversions += Number(row.conversions) || 0;
      return acc;
    },
    { clicks: 0, impressions: 0, spend: 0, conversions: 0 },
  );
}

function TrendCard({ title, series, keyName }) {
  const values = series.map((d) => Number(d[keyName]) || 0);
  const max = Math.max(...values, 0);
  const points = values
    .map((v, idx) => {
      const x = values.length > 1 ? (idx / (values.length - 1)) * 100 : 0;
      const y = max > 0 ? 100 - (v / max) * 100 : 100;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="rounded-xl border bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold">{title}</h2>
      <div className="h-56 rounded-lg border bg-gray-50 p-3">
        <svg viewBox="0 0 100 100" className="h-full w-full">
          <polyline fill="none" stroke="#2563eb" strokeWidth="2.5" points={points} />
        </svg>
      </div>
    </div>
  );
}

export default function App() {
  const [activePage, setActivePage] = useState("dashboard");
  const [rangePreset, setRangePreset] = useState("30d");
  const [rangeMode, setRangeMode] = useState("preset");
  const initialPresetRange = getRangeFromPreset("30d");
  const [customStartDate, setCustomStartDate] = useState(initialPresetRange.startDate);
  const [customEndDate, setCustomEndDate] = useState(initialPresetRange.endDate);
  const [platform, setPlatform] = useState("all");
  const [appFilter, setAppFilter] = useState("all");
  const [apps, setApps] = useState([]);
  const [adCampaigns, setAdCampaigns] = useState([]);
  const [campaignMapSelection, setCampaignMapSelection] = useState({});
  const [mappingBusyId, setMappingBusyId] = useState(null);
  const [sortKey, setSortKey] = useState("cost");
  const [sortDir, setSortDir] = useState("desc");
  const [adsRows, setAdsRows] = useState([]);
  const [trendRows, setTrendRows] = useState([]);
  const [previousTotals, setPreviousTotals] = useState(null);
  const [platformRevenueRaw, setPlatformRevenueRaw] = useState(null);
  const [adsCoverage, setAdsCoverage] = useState(null);
  const [revenueCoverage, setRevenueCoverage] = useState(null);
  const [schedulerStatus, setSchedulerStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadApps() {
      try {
        const res = await fetch(`${API_BASE_URL}/api/apps`);
        if (!res.ok) throw new Error(`apps failed: ${res.status}`);
        const data = await res.json();
        setApps(Array.isArray(data) ? data : []);
      } catch (e) {
        debugLog("apps.load.error", { message: e?.message });
      }
    }
    loadApps();
  }, []);

  useEffect(() => {
    async function loadAdCampaigns() {
      try {
        const res = await fetch(`${API_BASE_URL}/api/apps/ad-campaigns`);
        if (!res.ok) throw new Error(`ad-campaigns failed: ${res.status}`);
        const data = await res.json();
        const rows = Array.isArray(data) ? data : [];
        setAdCampaigns(rows);
      } catch (e) {
        debugLog("ad-campaigns.load.error", { message: e?.message });
      }
    }
    loadAdCampaigns();
  }, []);

  const range = useMemo(() => {
    if (rangeMode === "custom") {
      return { startDate: customStartDate, endDate: customEndDate };
    }
    return getRangeFromPreset(rangePreset);
  }, [customEndDate, customStartDate, rangeMode, rangePreset]);

  useEffect(() => {
    if (rangeMode === "custom" && customStartDate > customEndDate) {
      setError("Özel tarih aralığı geçersiz: başlangıç tarihi bitiş tarihinden büyük olamaz.");
      return;
    }

    async function load() {
      setLoading(true);
      setError("");
      try {
        debugLog("load.start", { range, platform });
        const prevRange = getPreviousRange(range.startDate, range.endDate);

        const adsUrl = new URL(`${API_BASE_URL}/api/ads-report`);
        adsUrl.searchParams.set("startDate", range.startDate);
        adsUrl.searchParams.set("endDate", range.endDate);
        if (platform !== "all") adsUrl.searchParams.set("platform", platform);
        if (appFilter !== "all") adsUrl.searchParams.set("appKey", appFilter);

        const trendUrl = new URL(`${API_BASE_URL}/api/ads-report/trend`);
        trendUrl.searchParams.set("startDate", range.startDate);
        trendUrl.searchParams.set("endDate", range.endDate);
        if (platform !== "all") trendUrl.searchParams.set("platform", platform);
        if (appFilter !== "all") trendUrl.searchParams.set("appKey", appFilter);

        const prevAdsUrl = new URL(`${API_BASE_URL}/api/ads-report`);
        prevAdsUrl.searchParams.set("startDate", prevRange.startDate);
        prevAdsUrl.searchParams.set("endDate", prevRange.endDate);
        if (platform !== "all") prevAdsUrl.searchParams.set("platform", platform);
        if (appFilter !== "all") prevAdsUrl.searchParams.set("appKey", appFilter);

        const platformRevenueRawUrl = new URL(`${API_BASE_URL}/api/revenue-report/platform-revenue-raw`);
        platformRevenueRawUrl.searchParams.set("startDate", range.startDate);
        platformRevenueRawUrl.searchParams.set("endDate", range.endDate);
        if (appFilter !== "all") platformRevenueRawUrl.searchParams.set("appKey", appFilter);

        const adsCoverageUrl = new URL(`${API_BASE_URL}/api/ads-report/coverage`);
        adsCoverageUrl.searchParams.set("startDate", range.startDate);
        adsCoverageUrl.searchParams.set("endDate", range.endDate);
        if (platform !== "all") adsCoverageUrl.searchParams.set("platform", platform);
        if (appFilter !== "all") adsCoverageUrl.searchParams.set("appKey", appFilter);

        const revenueCoverageUrl = new URL(`${API_BASE_URL}/api/revenue-report/coverage`);
        revenueCoverageUrl.searchParams.set("startDate", range.startDate);
        revenueCoverageUrl.searchParams.set("endDate", range.endDate);
        if (appFilter !== "all") revenueCoverageUrl.searchParams.set("appKey", appFilter);

        const schedulerUrl = `${API_BASE_URL}/api/system/scheduler-status`;

        const [adsRes, trendRes, prevAdsRes, platformRevenueRawRes, adsCoverageRes, revenueCoverageRes, schedulerRes] = await Promise.all([
          fetch(adsUrl),
          fetch(trendUrl),
          fetch(prevAdsUrl),
          fetch(platformRevenueRawUrl),
          fetch(adsCoverageUrl),
          fetch(revenueCoverageUrl),
          fetch(schedulerUrl),
        ]);

        if (!adsRes.ok) throw new Error(`ads-report failed: ${adsRes.status}`);
        if (!trendRes.ok) throw new Error(`ads-report trend failed: ${trendRes.status}`);
        if (!prevAdsRes.ok) throw new Error(`previous ads-report failed: ${prevAdsRes.status}`);
        if (!platformRevenueRawRes.ok) throw new Error(`platform-revenue-raw failed: ${platformRevenueRawRes.status}`);
        if (!adsCoverageRes.ok) throw new Error(`ads-coverage failed: ${adsCoverageRes.status}`);
        if (!revenueCoverageRes.ok) throw new Error(`revenue-coverage failed: ${revenueCoverageRes.status}`);
        if (!schedulerRes.ok) throw new Error(`scheduler-status failed: ${schedulerRes.status}`);

        const [adsData, trendData, prevAdsData, platformRevenueRawData, adsCoverageData, revenueCoverageData, schedulerData] = await Promise.all([
          adsRes.json(),
          trendRes.json(),
          prevAdsRes.json(),
          platformRevenueRawRes.json(),
          adsCoverageRes.json(),
          revenueCoverageRes.json(),
          schedulerRes.json(),
        ]);

        const currentRows = Array.isArray(adsData) ? adsData : [];
        const previousRows = Array.isArray(prevAdsData) ? prevAdsData : [];

        setAdsRows(currentRows);
        setTrendRows(Array.isArray(trendData) ? trendData : []);
        setPreviousTotals(sumTotals(previousRows));
        setPlatformRevenueRaw(platformRevenueRawData);
        setAdsCoverage(adsCoverageData);
        setRevenueCoverage(revenueCoverageData);
        setSchedulerStatus(schedulerData);
        debugLog("load.success", {
          rows: currentRows.length,
          trendRows: Array.isArray(trendData) ? trendData.length : 0,
          rawRevenueMathMode: platformRevenueRawData?.mathMode,
          appFilter,
        });
      } catch (e) {
        debugLog("load.error", { message: e?.message });
        setError(e.message || "Panel verileri yüklenemedi");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [appFilter, customEndDate, customStartDate, platform, range.endDate, range.startDate, rangeMode]);

  const tableRows = useMemo(
    () =>
      adsRows.map((r) => {
        const clicks = Number(r.clicks) || 0;
        const impressions = Number(r.impressions) || 0;
        const cost = Number(r.cost) || 0;
        const cpc = clicks > 0 ? cost / clicks : 0;
        const cpm = impressions > 0 ? (cost / impressions) * 1000 : 0;
        return { ...r, clicks, impressions, cost, cpc, cpm };
      }),
    [adsRows],
  );

  const platformSummary = useMemo(() => {
    const grouped = new Map();
    for (const r of tableRows) {
      const key = r.platform || "unknown";
      const current = grouped.get(key) || { platform: key, spend: 0, clicks: 0, campaigns: 0 };
      current.spend += Number(r.cost) || 0;
      current.clicks += Number(r.clicks) || 0;
      current.campaigns += 1;
      grouped.set(key, current);
    }
    return [...grouped.values()].sort((a, b) => b.spend - a.spend);
  }, [tableRows]);

  const sortedRows = useMemo(() => {
    const rows = [...tableRows];
    rows.sort((a, b) => {
      const aVal = Number(a[sortKey]) || 0;
      const bVal = Number(b[sortKey]) || 0;
      return sortDir === "asc" ? aVal - bVal : bVal - aVal;
    });
    return rows;
  }, [sortDir, sortKey, tableRows]);

  const totals = useMemo(() => sumTotals(tableRows), [tableRows]);

  const cpc = totals.clicks > 0 ? totals.spend / totals.clicks : 0;
  const cpm = totals.impressions > 0 ? (totals.spend / totals.impressions) * 1000 : 0;
  const activeCurrency = getPlatformCurrency(platform);

  function onSort(nextKey) {
    if (sortKey === nextKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(nextKey);
    setSortDir("desc");
  }

  function sortMarker(key) {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? "↑" : "↓";
  }

  async function mapCampaignToApp(adCampaignId) {
    const selectedAppKey = campaignMapSelection[adCampaignId];
    if (!selectedAppKey) return;
    const app = apps.find((a) => a.appKey === selectedAppKey);
    if (!app?.id) {
      setError("Seçilen uygulama bulunamadı.");
      return;
    }

    try {
      setMappingBusyId(adCampaignId);
      setError("");
      const res = await fetch(`${API_BASE_URL}/api/apps/campaign-mappings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appId: app.id,
          adCampaignId,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.message || `campaign mapping failed: ${res.status}`);
      }

      const refreshed = await fetch(`${API_BASE_URL}/api/apps/ad-campaigns`);
      if (refreshed.ok) {
        const data = await refreshed.json();
        setAdCampaigns(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      setError(e.message || "Kampanya eşleştirme başarısız");
    } finally {
      setMappingBusyId(null);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-gray-900">
              Reklam Analitik Paneli
            </h1>
            <button
              className={`rounded-lg border px-3 py-2 text-sm ${activePage === "dashboard" ? "border-blue-600 bg-blue-600 text-white" : "bg-white text-gray-700"}`}
              onClick={() => setActivePage("dashboard")}
            >
              Dashboard
            </button>
            <button
              className={`rounded-lg border px-3 py-2 text-sm ${activePage === "mapping" ? "border-blue-600 bg-blue-600 text-white" : "bg-white text-gray-700"}`}
              onClick={() => setActivePage("mapping")}
            >
              Kampanya Eşleştirme
            </button>
          </div>

          {activePage === "dashboard" ? (
            <div className="flex flex-wrap gap-3">
            <select
              className="rounded-lg border bg-white px-4 py-2"
              value={rangeMode}
              onChange={(e) => setRangeMode(e.target.value)}
            >
              <option value="preset">Hazır Aralık</option>
              <option value="custom">Özel Aralık</option>
            </select>

            {rangeMode === "preset" ? (
              <select
                className="rounded-lg border bg-white px-4 py-2"
                value={rangePreset}
                onChange={(e) => setRangePreset(e.target.value)}
              >
                <option value="7d">Son 7 Gün</option>
                <option value="30d">Son 30 Gün</option>
              </select>
            ) : (
              <>
                <input
                  type="date"
                  className="rounded-lg border bg-white px-4 py-2"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                />
                <input
                  type="date"
                  className="rounded-lg border bg-white px-4 py-2"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                />
              </>
            )}

            <select
              className="rounded-lg border bg-white px-4 py-2"
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
            >
              <option value="all">Tüm Platformlar</option>
              <option value="google">Google Ads</option>
              <option value="apple">Apple Search Ads</option>
            </select>

            <select
              className="rounded-lg border bg-white px-4 py-2"
              value={appFilter}
              onChange={(e) => setAppFilter(e.target.value)}
            >
              <option value="all">Tüm Uygulamalar</option>
              {apps.map((app) => (
                <option key={app.appKey} value={app.appKey}>
                  {app.appName || app.appKey}
                </option>
              ))}
            </select>

            <button
              className="rounded-lg bg-blue-600 px-4 py-2 text-white disabled:bg-blue-300"
              onClick={() => downloadCsv(tableRows)}
              disabled={!tableRows.length}
            >
              CSV İndir
            </button>
            </div>
          ) : null}
        </div>

        {error ? (
          <div className="mb-6 rounded-lg border border-red-300 bg-red-50 p-4 text-red-700">
            {error}
          </div>
        ) : null}
        {loading && activePage === "dashboard" ? <LoadingSkeleton /> : null}

        {activePage === "dashboard" ? (
        <>
        <div className="mb-6 rounded-xl border bg-white p-4 shadow-sm">
          <p className="mb-3 text-sm font-semibold text-gray-700">
            Platform Kırılımı
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              className={`rounded-full border px-3 py-1 text-sm ${platform === "all" ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-700"}`}
              onClick={() => setPlatform("all")}
            >
              Tümü
            </button>
            {platformSummary.map((p) => (
              <button
                key={p.platform}
                className={`rounded-full border px-3 py-1 text-sm ${platform === p.platform ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-700"}`}
                onClick={() => setPlatform(p.platform)}
              >
                {p.platform} | {formatCurrency(p.spend, getPlatformCurrency(p.platform))} harcama
              </button>
            ))}
          </div>
        </div>

        <div className="mb-8 grid gap-6 md:grid-cols-3 xl:grid-cols-6">
          <KpiCard
            label="Tıklama"
            value={formatNumber(totals.clicks)}
            delta={percentChange(totals.clicks, previousTotals?.clicks)}
          />
          <KpiCard
            label="Gösterim"
            value={formatNumber(totals.impressions)}
            delta={percentChange(
              totals.impressions,
              previousTotals?.impressions,
            )}
          />
          <KpiCard
            label="Harcama"
            value={formatCurrency(totals.spend, activeCurrency)}
            delta={percentChange(totals.spend, previousTotals?.spend)}
          />
          <KpiCard
            label="Dönüşüm"
            value={formatNumber(totals.conversions)}
            delta={percentChange(
              totals.conversions,
              previousTotals?.conversions,
            )}
          />
          <KpiCard label="CPC" value={formatCurrency(cpc, activeCurrency)} />
          <KpiCard label="CPM" value={formatCurrency(cpm, activeCurrency)} />
        </div>

        <div className="mb-8 grid gap-6 lg:grid-cols-2">
          <CoverageCard
            title="Ads Veri Kapsamı (DB)"
            coverage={adsCoverage}
          />
          <CoverageCard
            title="Mağaza Geliri Veri Kapsamı (DB)"
            coverage={revenueCoverage}
            isRevenue
            platform={platform}
          />
        </div>

        <div className="mb-8 rounded-xl border bg-white p-4 text-sm text-gray-700 shadow-sm">
          <p>
            <span className="font-semibold">CPC (Cost Per Click):</span> Toplam
            Harcama / Toplam Tıklama
          </p>
          <p>
            <span className="font-semibold">CPM (Cost Per Mille):</span> (Toplam
            Harcama / Toplam Gösterim) x 1000
          </p>
        </div>

        <div className="mb-8 grid gap-6 lg:grid-cols-2">
          <TrendCard
            title="Günlük Harcama Trendi"
            series={trendRows}
            keyName="cost"
          />
          <TrendCard
            title="Günlük Tıklama Trendi"
            series={trendRows}
            keyName="clicks"
          />
        </div>

        <div className="mb-8 grid gap-6 lg:grid-cols-2">
          <div className="rounded-xl border bg-white p-6 shadow-sm lg:col-span-2">
            <h2 className="mb-3 text-lg font-semibold">Platform Bazlı Gelir</h2>
            {platformRevenueRaw ? (
              <>
                <div className={`grid gap-4 ${platform === "all" ? "md:grid-cols-2" : "md:grid-cols-1"}`}>
                  {(platform === "all" || platform === "apple") ? (
                    <PlatformRevenueListCard
                      title="Apple Revenue"
                      items={platformRevenueRaw.apple}
                    />
                  ) : null}
                  {(platform === "all" || platform === "google") ? (
                    <PlatformRevenueListCard
                      title="Google Revenue"
                      items={platformRevenueRaw.google}
                    />
                  ) : null}
                </div>
                <p className="mt-3 text-xs text-gray-500">
                  Ham mağaza verisi (dönüşüm yok)
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  Para birimleri birleştirilmedi
                </p>
              </>
            ) : (
              <p className="text-gray-500">
                Platform karşılaştırma verisi bulunamadı.
              </p>
            )}
          </div>

          <div className="rounded-xl border bg-white p-6 shadow-sm">
            <h2 className="mb-3 text-lg font-semibold">Zamanlayıcı Durumu</h2>
            {schedulerStatus ? (
              <div className="space-y-1 text-sm text-gray-700">
                <p>
                  Aktif:{" "}
                  <span className="font-semibold">
                    {String(schedulerStatus.enabled)}
                  </span>
                </p>
                <p>
                  Çalışıyor:{" "}
                  <span className="font-semibold">
                    {String(schedulerStatus.isSyncRunning)}
                  </span>
                </p>
                <p>
                  Sonraki Çalışma (UTC):{" "}
                  <span className="font-semibold">
                    {schedulerStatus.nextRunAt || "-"}
                  </span>
                </p>
                <p>
                  Son Başlangıç:{" "}
                  <span className="font-semibold">
                    {schedulerStatus.lastRunStartedAt || "-"}
                  </span>
                </p>
                <p>
                  Son Bitiş:{" "}
                  <span className="font-semibold">
                    {schedulerStatus.lastRunCompletedAt || "-"}
                  </span>
                </p>
              </div>
            ) : (
              <p className="text-gray-500">Zamanlayıcı verisi bulunamadı.</p>
            )}
          </div>
        </div>

        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">Kampanya Performansı</h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b bg-gray-100">
                  <th className="p-3">Platform</th>
                  <th className="p-3">Kampanya Adı</th>
                  <th className="p-3">
                    <button
                      className="font-semibold"
                      onClick={() => onSort("clicks")}
                    >
                      Tıklama {sortMarker("clicks")}
                    </button>
                  </th>
                  <th className="p-3">
                    <button
                      className="font-semibold"
                      onClick={() => onSort("impressions")}
                    >
                      Gösterim {sortMarker("impressions")}
                    </button>
                  </th>
                  <th className="p-3">
                    <button
                      className="font-semibold"
                      onClick={() => onSort("cost")}
                    >
                      Harcama {sortMarker("cost")}
                    </button>
                  </th>
                  <th className="p-3">
                    <button
                      className="font-semibold"
                      onClick={() => onSort("conversions")}
                    >
                      Dönüşüm {sortMarker("conversions")}
                    </button>
                  </th>
                  <th className="p-3">
                    <button
                      className="font-semibold"
                      onClick={() => onSort("cpc")}
                    >
                      CPC {sortMarker("cpc")}
                    </button>
                  </th>
                  <th className="p-3">
                    <button
                      className="font-semibold"
                      onClick={() => onSort("cpm")}
                    >
                      CPM {sortMarker("cpm")}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row, idx) => (
                  <tr
                    key={`${row.platform}-${row.campaign}-${idx}`}
                    className="border-b"
                  >
                    <td className="p-3">{row.platform}</td>
                    <td className="p-3">{row.campaign || "-"}</td>
                    <td className="p-3">{formatNumber(row.clicks)}</td>
                    <td className="p-3">{formatNumber(row.impressions)}</td>
                    <td className="p-3">{formatCurrency(row.cost, getPlatformCurrency(row.platform))}</td>
                    <td className="p-3">
                      {formatNumber(Number(row.conversions) || 0)}
                    </td>
                    <td className="p-3">{formatCurrency(row.cpc, getPlatformCurrency(row.platform))}</td>
                    <td className="p-3">{formatCurrency(row.cpm, getPlatformCurrency(row.platform))}</td>
                  </tr>
                ))}
                {!sortedRows.length ? (
                  <tr>
                    <td className="p-3 text-gray-500" colSpan={8}>
                      Bu filtre için kampanya verisi bulunamadı.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
        </>
        ) : null}

        {activePage === "mapping" ? (
        <div className="mt-2 rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">Kampanya-Uygulama Eşleştirme</h2>
          <p className="mb-4 text-sm text-gray-600">
            Her reklam kampanyası yalnızca bir uygulamaya bağlanır. Eşleştirme sonrası uygulama filtresi ile giderler uygulama bazlı raporlanır.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b bg-gray-100">
                  <th className="p-3">Platform</th>
                  <th className="p-3">Campaign ID</th>
                  <th className="p-3">Campaign Name</th>
                  <th className="p-3">Bağlı Uygulama</th>
                  <th className="p-3">Eşleştir</th>
                </tr>
              </thead>
              <tbody>
                {adCampaigns.map((row) => {
                  const selectedValue = campaignMapSelection[row.adCampaignId] || row.appKey || "";
                  const isSameMapping = selectedValue && selectedValue === (row.appKey || "");
                  return (
                    <tr key={`${row.platform}-${row.adCampaignId}`} className="border-b">
                      <td className="p-3">{row.platform}</td>
                      <td className="p-3">{row.campaignId}</td>
                      <td className="p-3">{row.campaignName || "-"}</td>
                      <td className="p-3">{row.appName || row.appKey || "Bağlı değil"}</td>
                      <td className="p-3">
                        <div className="flex gap-2">
                          <select
                            className="rounded border bg-white px-2 py-1"
                            value={selectedValue}
                            onChange={(e) =>
                              setCampaignMapSelection((prev) => ({
                                ...prev,
                                [row.adCampaignId]: e.target.value,
                              }))}
                          >
                            <option value="">Uygulama seç</option>
                            {apps.map((app) => (
                              <option key={app.appKey} value={app.appKey}>
                                {app.appName || app.appKey}
                              </option>
                            ))}
                          </select>
                          <button
                            className="rounded bg-blue-600 px-3 py-1 text-white disabled:bg-blue-300"
                            onClick={() => mapCampaignToApp(row.adCampaignId)}
                            disabled={!selectedValue || mappingBusyId === row.adCampaignId || isSameMapping}
                          >
                            {mappingBusyId === row.adCampaignId ? "Kaydediliyor..." : "Kaydet"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!adCampaigns.length ? (
                  <tr>
                    <td className="p-3 text-gray-500" colSpan={5}>
                      Henüz kampanya kaydı yok. Önce ads sync çalıştırın.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
        ) : null}
      </div>
    </div>
  );
}

function KpiCard({ label, value, delta = null }) {
  const deltaText =
    delta == null ? "Önceki dönem verisi yok" : `${delta >= 0 ? "↑" : "↓"} %${Math.abs(delta).toFixed(1)} önceki döneme göre`;
  const deltaColor = delta == null ? "text-gray-500" : delta >= 0 ? "text-green-600" : "text-red-600";

  return (
    <div className="rounded-xl border bg-white p-6 shadow-sm">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
      <p className={`mt-1 text-sm ${deltaColor}`}>{deltaText}</p>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="mb-6 animate-pulse rounded-xl border bg-white p-4">
      <div className="mb-3 h-4 w-40 rounded bg-gray-200" />
      <div className="grid gap-3 md:grid-cols-3">
        <div className="h-10 rounded bg-gray-200" />
        <div className="h-10 rounded bg-gray-200" />
        <div className="h-10 rounded bg-gray-200" />
      </div>
    </div>
  );
}

function PlatformRevenueListCard({ title, items }) {
  return (
    <div className="rounded-lg border bg-gray-50 p-4">
      <p className="text-sm font-semibold text-gray-800">{title}</p>
      <div className="mt-2 space-y-1 text-sm text-gray-700">
        {(items || []).length ? (
          items.map((item) => (
            <p key={`${title}-${item.currency}`}>
              {item.currency}:{" "}
              <span className="font-semibold">
                {formatCurrencyCode(item.revenue, item.currency)}
              </span>
            </p>
          ))
        ) : (
          <p className="text-gray-500">Veri yok</p>
        )}
      </div>
    </div>
  );
}

function CoverageCard({ title, coverage, isRevenue = false, platform = "all" }) {
  if (!coverage) {
    return (
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold">{title}</h2>
        <p className="text-sm text-gray-500">Veri kapsamı bulunamadı.</p>
      </div>
    );
  }

  if (!isRevenue) {
    return (
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold">{title}</h2>
        <div className="space-y-1 text-sm text-gray-700">
          <p>Seçili aralık: {coverage.startDate} - {coverage.endDate}</p>
          <p>DB kapsamı: {coverage.minDate || "-"} - {coverage.maxDate || "-"}</p>
          <p>Veri gün sayısı: {coverage.daysWithData} / {coverage.expectedDays}</p>
          <p>Eksik gün: {coverage.missingDays}</p>
          <p>Toplam satır: {coverage.rowCount}</p>
          <p>Kampanya sayısı: {coverage.campaignCount}</p>
        </div>
      </div>
    );
  }

  const showApple = platform === "all" || platform === "apple";
  const showGoogle = platform === "all" || platform === "google";

  return (
    <div className="rounded-xl border bg-white p-6 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      <p className="mb-2 text-sm text-gray-700">
        Seçili aralık: {coverage.startDate} - {coverage.endDate}
      </p>
      <div className="space-y-3 text-sm text-gray-700">
        {showApple ? (
          <CoverageStoreBlock label="Apple" data={coverage.stores?.app_store} />
        ) : null}
        {showGoogle ? (
          <CoverageStoreBlock label="Google" data={coverage.stores?.google_play} />
        ) : null}
      </div>
    </div>
  );
}

function CoverageStoreBlock({ label, data }) {
  if (!data) {
    return (
      <div className="rounded-lg border bg-gray-50 p-3">
        <p className="font-semibold">{label}</p>
        <p className="text-gray-500">Veri yok</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-gray-50 p-3">
      <p className="font-semibold">{label}</p>
      <p>DB kapsamı: {data.minDate || "-"} - {data.maxDate || "-"}</p>
      <p>Veri gün sayısı: {data.daysWithData}</p>
      <p>Eksik gün: {data.missingDays}</p>
      <p>Toplam satır: {data.rowCount}</p>
      <p>Para birimi sayısı: {data.currencyCount}</p>
    </div>
  );
}
