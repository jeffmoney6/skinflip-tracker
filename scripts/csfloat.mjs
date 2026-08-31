// csfloat.mjs
//
// Hämtar aktiva listningar från CSFloat och bygger en karta:
//   market_hash_name -> billigaste pris (omräknat till EUR)
//
// Kräver en API-nyckel. Den läses från miljövariabeln CSFLOAT_API_KEY,
// som sätts i GitHub Actions från repots secret med samma namn.
//
// VIKTIGT: CSFloat anger priser i CENT och i USD. Vi räknar om till EUR
// med kursen i config.mjs (USD_TO_EUR). Den kursen är fast och måste
// justeras manuellt då och då - se README.

import { CONFIG } from "./config.mjs";

const CSFLOAT_LISTINGS_URL = "https://csfloat.com/api/v1/listings";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// CSFloat vill ha priser i USD-cent. Vår config är i EUR.
function eurToUsdCents(eur) {
  return Math.round((eur / CONFIG.USD_TO_EUR) * 100);
}

function usdCentsToEur(cents) {
  return Math.round(cents * 0.01 * CONFIG.USD_TO_EUR * 100) / 100;
}

export async function fetchCsfloatPrices() {
  const apiKey = process.env.CSFLOAT_API_KEY;
  if (!apiKey) {
    console.warn("CSFLOAT_API_KEY saknas - hoppar över CSFloat helt.");
    return new Map();
  }

  const minCents = eurToUsdCents(CONFIG.MIN_PRICE_EUR);
  const maxCents = eurToUsdCents(CONFIG.MAX_PRICE_EUR);

  const cheapestByName = new Map();
  let cursor = null;
  let pagesFetched = 0;

  console.log("Hämtar CSFloat-listningar...");

  while (pagesFetched < CONFIG.CSFLOAT_MAX_PAGES) {
    const url = new URL(CSFLOAT_LISTINGS_URL);
    url.searchParams.set("limit", "50");
    url.searchParams.set("sort_by", "lowest_price");
    url.searchParams.set("min_price", String(minCents));
    url.searchParams.set("max_price", String(maxCents));
    if (cursor) url.searchParams.set("cursor", cursor);

    let res;
    try {
      res = await fetch(url, { headers: { Authorization: apiKey } });
    } catch (err) {
      console.warn(`CSFloat-anrop kraschade: ${err.message}. Avbryter CSFloat.`);
      break;
    }

    if (res.status === 429) {
      console.warn("CSFloat rate-limitade oss. Avbryter CSFloat för denna körning.");
      break;
    }
    if (!res.ok) {
      console.warn(`CSFloat svarade ${res.status}. Avbryter CSFloat.`);
      break;
    }

    let body;
    try {
      body = await res.json();
    } catch {
      console.warn("Kunde inte tolka CSFloat-svaret som JSON. Avbryter CSFloat.");
      break;
    }

    // Svaret kan vara antingen en ren array eller ett objekt med "data".
    const listings = Array.isArray(body) ? body : (body.data ?? []);
    if (listings.length === 0) break;

    for (const listing of listings) {
      const name = listing?.item?.market_hash_name;
      const priceCents = listing?.price;
      if (!name || typeof priceCents !== "number") continue;
      if (listing.type && listing.type !== "buy_now") continue;

      const priceEur = usdCentsToEur(priceCents);
      const existing = cheapestByName.get(name);
      if (!existing || priceEur < existing.price_eur) {
        cheapestByName.set(name, {
          price_eur: priceEur,
          float_value: listing?.item?.float_value ?? null,
        });
      }
    }

    pagesFetched++;

    // Paginering: hämta nästa cursor om den finns.
    cursor = Array.isArray(body) ? null : (body.cursor ?? null);
    if (!cursor) break;

    await sleep(CONFIG.CSFLOAT_REQUEST_DELAY_MS);
  }

  console.log(
    `CSFloat: ${cheapestByName.size} unika skins från ${pagesFetched} sidor.`
  );
  return cheapestByName;
}
