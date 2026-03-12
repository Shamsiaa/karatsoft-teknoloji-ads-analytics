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

async function fetchAllRatesForDate(date) {
  const iso = String(date);
  const primaryUrl = `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${iso}/v1/currencies/usd.json`;
  const fallbackUrl = `https://${iso}.currency-api.pages.dev/v1/currencies/usd.json`;

  try {
    return await requestJson(primaryUrl);
  } catch (_err) {
    return await requestJson(fallbackUrl);
  }
}

async function syncExchangeRateForDate(date, targetCurrency = "USD") {
  const target = String(targetCurrency || "USD").toUpperCase();
  const payload = await fetchAllRatesForDate(date);
  const rateDate = payload?.date || date;
  const rates = payload?.usd || payload?.USD;
  if (!rates || typeof rates !== "object") {
    throw new Error(`No USD rates in FX response for ${date}`);
  }

  await exchangeRatesRepo.upsertCurrency("USD", "US Dollar");
  let storedCount = 0;
  for (const [codeRaw, rateRaw] of Object.entries(rates)) {
    const code = String(codeRaw || "").trim().toUpperCase();
    if (!code || code.length !== 3 || !/^[A-Z]{3}$/.test(code)) continue;
    const rate = Number(rateRaw);
    if (!Number.isFinite(rate)) continue;
    await exchangeRatesRepo.upsertCurrency(code, code);
    await exchangeRatesRepo.upsertExchangeRate(code, rateDate, rate);
    storedCount += 1;
  }

  const targetRate = rates[String(target).toLowerCase()] ?? rates[target];
  if (targetRate == null) {
    throw new Error(`No ${target} rate in FX response for ${date}`);
  }

  return {
    source: "fawazahmed0",
    baseCurrency: "USD",
    targetCurrency: target,
    rateDate,
    exchangeRate: Number(targetRate),
    storedCount,
  };
}

module.exports = {
  syncExchangeRateForDate,
};
