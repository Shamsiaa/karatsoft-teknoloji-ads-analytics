const https = require("https");
const { generateJWTFromEnv } = require("./jwt.service");

const APPLE_OAUTH_TOKEN_URL = "https://appleid.apple.com/auth/oauth2/token";

let cachedAccessToken = null;
let cachedAccessTokenExpiresAtMs = 0;

function getScopeFromEnv() {
  // Apple Search Ads scope commonly used for org-level access
  return process.env.APPLE_ADS_SCOPE || "searchadsorg";
}

async function fetchAppleOAuthToken() {
  const clientId = process.env.APPLE_CLIENT_ID;
  if (!clientId) {
    throw new Error("Missing required Apple Ads credential: APPLE_CLIENT_ID");
  }

  const clientSecret = generateJWTFromEnv();
  const scope = getScopeFromEnv();

  const form = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope,
  }).toString();

  return new Promise((resolve, reject) => {
    const urlObj = new URL(APPLE_OAUTH_TOKEN_URL);
    const req = https.request(
      {
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(form),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          let parsed;
          try {
            parsed = JSON.parse(data);
          } catch (e) {
            return reject(new Error(`Failed to parse OAuth response: ${e.message}`));
          }

          if (res.statusCode >= 200 && res.statusCode < 300) {
            return resolve(parsed);
          }

          return reject(
            new Error(
              `Apple OAuth error: ${res.statusCode} - ${JSON.stringify(parsed)}`
            )
          );
        });
      }
    );

    req.on("error", (error) => {
      reject(new Error(`Apple OAuth request failed: ${error.message}`));
    });

    req.write(form);
    req.end();
  });
}

async function getAppleAdsAccessToken() {
  const now = Date.now();
  // Refresh 60s early to avoid edge expiry
  if (cachedAccessToken && now < cachedAccessTokenExpiresAtMs - 60_000) {
    return cachedAccessToken;
  }

  const tokenResponse = await fetchAppleOAuthToken();
  const accessToken = tokenResponse.access_token;
  const expiresInSec = tokenResponse.expires_in;

  if (!accessToken) {
    throw new Error(`OAuth token response missing access_token: ${JSON.stringify(tokenResponse)}`);
  }

  cachedAccessToken = accessToken;
  cachedAccessTokenExpiresAtMs =
    now + (typeof expiresInSec === "number" ? expiresInSec * 1000 : 55 * 60 * 1000);

  return cachedAccessToken;
}

module.exports = {
  getAppleAdsAccessToken,
};

