const express = require("express");
require("dotenv").config();

const reportRoutes = require("./routes/report.route");
const appleAdsRoutes = require("./routes/appleAds.route");
const adsReportRoutes = require("./routes/adsReport.route");
const revenueReportRoutes = require("./routes/revenueReport.route");
const systemRoutes = require("./routes/system.route");
const appsRoutes = require("./routes/apps.route");
const { startDailyFetchJob, stopDailyFetchJob } = require("./jobs/dailyFetch.job");
const logger = require("./utils/logger");

const app = express();

app.use(express.json());
app.use((req, res, next) => {
  const start = Date.now();
  const requestId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  req.requestId = requestId;
  res.setHeader("x-request-id", requestId);

  logger.info("http.request.start", {
    requestId,
    method: req.method,
    path: req.path,
    query: req.query || {},
  });

  res.on("finish", () => {
    logger.info("http.request.finish", {
      requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: Date.now() - start,
    });
  });

  next();
});
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
app.use("/api/apps", appsRoutes);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  logger.info("server.start", { port: PORT });
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
