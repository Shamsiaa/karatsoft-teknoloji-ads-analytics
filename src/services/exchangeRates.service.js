const https = require("https");
const exchangeRatesRepo = require("../db/exchangeRates.repository");

function requestJson(url) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request(
      {
        method: "GET",
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        path: `${parsed.pathname}${parsed.search}`,
        headers: { Accept: "application/json" },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => {
          data += c;
        });
        res.on("end", () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(new Error(`FX request failed (${res.statusCode}): ${data.slice(0, 300)}`));
          }
          try {
            return resolve(JSON.parse(data || "{}"));
          } catch (err) {
            return reject(new Error(`FX JSON parse failed: ${err.message}`));
          }
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

async function syncExchangeRateForDate(date, targetCurrency = "USD") {
  const target = String(targetCurrency || "USD").toUpperCase();
  const url = new URL(`https://api.frankfurter.app/${date}`);
  url.searchParams.set("from", "TRY");
  url.searchParams.set("to", target);

  const payload = await requestJson(url.toString());
  const rateDate = payload?.date || date;
  const rate = payload?.rates?.[target];
  if (rate == null) {
    throw new Error(`No ${target} rate in FX response for ${date}`);
  }

  await exchangeRatesRepo.upsertCurrency("TRY", "Turkish Lira");
  await exchangeRatesRepo.upsertCurrency(target, target);
  await exchangeRatesRepo.upsertExchangeRate(target, rateDate, rate);

  return {
    source: "frankfurter",
    baseCurrency: "TRY",
    targetCurrency: target,
    rateDate,
    exchangeRate: Number(rate),
  };
}

module.exports = {
  syncExchangeRateForDate,
};
