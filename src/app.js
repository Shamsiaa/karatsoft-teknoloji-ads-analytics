const express = require("express");
require("dotenv").config();

const reportRoutes = require("./routes/report.route");
const appleAdsRoutes = require("./routes/appleAds.route");
const adsReportRoutes = require("./routes/adsReport.route");
const revenueReportRoutes = require("./routes/revenueReport.route");
const systemRoutes = require("./routes/system.route");
const { startDailyFetchJob, stopDailyFetchJob } = require("./jobs/dailyFetch.job");

const app = express();

app.use(express.json());
app.use((req, res, next) => {
  const allowedOrigin = process.env.CORS_ORIGIN || "*";
  res.header("Access-Control-Allow-Origin", allowedOrigin);
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  return next();
});

// Health check
app.get("/", (req, res) => {
  res.send("API is running 🚀");
});

// Routes
app.use("/report", reportRoutes);
app.use("/apple-ads", appleAdsRoutes);
// Unified ads report (project spec): GET /api/ads-report, POST /api/ads-report/sync
app.use("/api/ads-report", adsReportRoutes);
app.use("/api/revenue-report", revenueReportRoutes);
app.use("/api/system", systemRoutes);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  startDailyFetchJob();
});

process.on("SIGINT", () => {
  stopDailyFetchJob();
  process.exit(0);
});

process.on("SIGTERM", () => {
  stopDailyFetchJob();
  process.exit(0);
});
