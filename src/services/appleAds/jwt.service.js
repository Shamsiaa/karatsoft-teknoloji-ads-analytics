const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");

/**
 * Generate JWT ES256 token for Apple Ads API authentication
 * @param {string} teamId - Apple Team ID
 * @param {string} clientId - Apple Client ID
 * @param {string} keyId - Apple Key ID
 * @param {string} privateKeyPath - Path to private-key.pem file
 * @returns {string} JWT token
 */
function generateAppleAdsJWT(teamId, clientId, keyId, privateKeyPath) {
  try {
    // Read the private key file
    const privateKey = fs.readFileSync(privateKeyPath, "utf8");

    // JWT header
    const header = {
      alg: "ES256",
      kid: keyId,
    };

    // JWT payload
    const payload = {
      iss: teamId,
      iat: Math.floor(Date.now() / 1000), // Issued at time (current time)
      exp: Math.floor(Date.now() / 1000) + 60 * 60, // Expires in 1 hour
      aud: "https://appleid.apple.com",
      sub: clientId,
    };

    // Sign the token
    const token = jwt.sign(payload, privateKey, {
      algorithm: "ES256",
      header: header,
    });

    return token;
  } catch (error) {
    throw new Error(`Failed to generate Apple Ads JWT: ${error.message}`);
  }
}

/**
 * Generate JWT using environment variables
 * @returns {string} JWT token
 */
function generateJWTFromEnv() {
  const teamId = process.env.APPLE_TEAM_ID;
  const clientId = process.env.APPLE_CLIENT_ID;
  const keyId = process.env.APPLE_KEY_ID;
  const privateKeyPath =
    process.env.APPLE_PRIVATE_KEY_PATH || path.join(__dirname, "../../../private-key.pem");

  if (!teamId || !clientId || !keyId) {
    throw new Error(
      "Missing required Apple Ads credentials: APPLE_TEAM_ID, APPLE_CLIENT_ID, APPLE_KEY_ID"
    );
  }

  return generateAppleAdsJWT(teamId, clientId, keyId, privateKeyPath);
}

module.exports = {
  generateAppleAdsJWT,
  generateJWTFromEnv,
};
