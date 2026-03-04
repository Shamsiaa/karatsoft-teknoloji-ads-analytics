const express = require("express");
const {
  listApps,
  upsertApp,
  listMappings,
  upsertMapping,
  importStoreRevenue,
  importAppStoreCsv,
  importGooglePlayCsv,
  syncStoreRevenue,
  syncStoreRevenueRange,
} = require("../controllers/apps.controller");

const router = express.Router();

router.get("/", listApps);
router.post("/", upsertApp);

router.get("/campaign-mappings", listMappings);
router.post("/campaign-mappings", upsertMapping);

router.post("/store-revenue/import", importStoreRevenue);
router.post("/store-revenue/import/app-store-csv", importAppStoreCsv);
router.post("/store-revenue/import/google-play-csv", importGooglePlayCsv);
router.post("/store-revenue/sync", syncStoreRevenue);
router.post("/store-revenue/sync-range", syncStoreRevenueRange);

module.exports = router;
