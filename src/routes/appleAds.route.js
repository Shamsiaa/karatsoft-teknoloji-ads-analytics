const express = require("express");
const router = express.Router();
const { getCampaigns, getAdGroups } = require("../controllers/appleAds.controller");

// GET /apple-ads/campaigns?startDate=2024-01-01&endDate=2024-01-31
router.get("/campaigns", getCampaigns);

// GET /apple-ads/adgroups?startDate=2024-01-01&endDate=2024-01-31&campaignId=123
router.get("/adgroups", getAdGroups);

module.exports = router;
