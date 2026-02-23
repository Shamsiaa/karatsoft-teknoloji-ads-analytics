require("dotenv").config();
const { google } = require("googleapis");

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_ADS_CLIENT_ID,
  process.env.GOOGLE_ADS_CLIENT_SECRET,
  // Redirect URI not used when exchanging refresh token
  "http://localhost:3000/oauth2callback",
);

let cachedAccessToken = null;
let cachedExpiryMs = 0;

async function getGoogleAdsAccessToken() {
  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
  if (!refreshToken) {
    throw new Error("Missing GOOGLE_ADS_REFRESH_TOKEN in environment");
  }

  const now = Date.now();
  if (cachedAccessToken && now < cachedExpiryMs - 60_000) {
    return cachedAccessToken;
  }

  oauth2Client.setCredentials({ refresh_token: refreshToken });

  const { token } = await oauth2Client.getAccessToken();
  if (!token) {
    throw new Error("Failed to obtain Google Ads access token");
  }

  // googleapis sets expiry_date on internal credentials; use it if available
  const expiryDate = oauth2Client.credentials.expiry_date;
  cachedAccessToken = token;
  cachedExpiryMs = typeof expiryDate === "number" ? expiryDate : now + 50 * 60 * 1000;

  return cachedAccessToken;
}

module.exports = {
  getGoogleAdsAccessToken,
};

