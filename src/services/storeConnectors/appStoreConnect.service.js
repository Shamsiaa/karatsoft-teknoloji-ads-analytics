const fs = require("fs");
const https = require("https");
const zlib = require("zlib");
const jwt = require("jsonwebtoken");
const { importStoreCsv } = require("../storeRevenueCsv.service");

function getRequiredEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function getAppStoreToken() {
  const issuerId = getRequiredEnv("APP_STORE_CONNECT_ISSUER_ID");
  const keyId = getRequiredEnv("APP_STORE_CONNECT_KEY_ID");
  const privateKeyPath = getRequiredEnv("APP_STORE_CONNECT_PRIVATE_KEY_PATH");
  const privateKey = fs.readFileSync(privateKeyPath, "utf8");

  return jwt.sign(
    {
      iss: issuerId,
      aud: "appstoreconnect-v1",
      exp: Math.floor(Date.now() / 1000) + 19 * 60,
    },
    privateKey,
    {
      algorithm: "ES256",
      header: {
        alg: "ES256",
        kid: keyId,
        typ: "JWT",
      },
    },
  );
}

function downloadAppStoreReport(date) {
  const vendorNumber = getRequiredEnv("APP_STORE_CONNECT_VENDOR_NUMBER");
  const token = getAppStoreToken();

  const url = new URL("https://api.appstoreconnect.apple.com/v1/salesReports");
  url.searchParams.set("filter[frequency]", "DAILY");
  url.searchParams.set("filter[reportDate]", date);
  url.searchParams.set("filter[reportType]", "SALES");
  url.searchParams.set("filter[reportSubType]", "SUMMARY");
  url.searchParams.set("filter[vendorNumber]", vendorNumber);

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        method: "GET",
        protocol: url.protocol,
        hostname: url.hostname,
        path: `${url.pathname}${url.search}`,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/a-gzip",
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(
              new Error(
                `App Store report request failed (${res.statusCode}): ${buf.toString("utf8").slice(0, 500)}`,
              ),
            );
          }

          zlib.gunzip(buf, (err, out) => {
            if (err) return reject(new Error(`Failed to decompress App Store report: ${err.message}`));
            return resolve(out.toString("utf8"));
          });
        });
      },
    );

    req.on("error", reject);
    req.end();
  });
}

async function syncAppStoreRevenueForDate(appKey, date) {
  const reportText = await downloadAppStoreReport(date);
  const result = await importStoreCsv(appKey, reportText, "app_store", "USD", "app_store_connect_api");
  return {
    appKey,
    date,
    store: "app_store",
    ...result,
  };
}

module.exports = {
  syncAppStoreRevenueForDate,
};
