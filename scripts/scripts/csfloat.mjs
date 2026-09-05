// csfloat.mjs
//
// Slår upp CSFloat-listningar för EN specifik skin i taget.
//
// Varför per skin istället för en stor svep? Ett svep hämtar de billigaste
// listningarna överlag, vilket nästan aldrig är samma skins som vi kollar
// mot Steam. Uppslagning per namn ger träff varje gång.
//
// Kräver API-nyckel i miljövariabeln CSFLOAT_API_KEY (sätts av GitHub
// Actions från repots secret).
//
// VIKTIGT: CSFloat anger priser i CENT och i USD. Vi räknar om till EUR
// med kursen USD_TO_EUR i config.mjs. Den är fast och måste justeras
// manuellt när valutan rört sig.

import { CONFIG } from "./config.mjs";

const CSFLOAT_LISTINGS_URL = "https://csfloat.com/api/v1/listings";

function usdCentsToEur(cents) {
  return Math.round(cents * 0.01 * CONFIG.USD_TO_EUR * 100) / 100;
}

export function hasCsfloatKey() {
  return Boolean(process.env.CSFLOAT_API_KEY);
}

// Returnerar null om inget hittades, annars info om billigaste listningen.
export async function fetchCsfloatListing(marketHashName) {
  const apiKey = process.env.CSFLOAT_API_KEY;
  if (!apiKey) return null;

  const url = new URL(CSFLOAT_LISTINGS_URL);
  url.searchParams.set("market_hash_name", marketHashName);
  url.searchParams.set("sort_by", "lowest_price");
  url.searchParams.set("limit", String(CONFIG.CSFLOAT_LISTINGS_PER_ITEM));
  url.searchParams.set("type", "buy_now");

  let res;
  try {
    res = await fetch(url, { headers: { Authorization: apiKey } });
  } catch (err) {
    return { error: err.message };
  }

  if (res.status === 429) return { rateLimited: true };
  if (!res.ok) return { error: `HTTP ${res.status}` };

  let body;
  try {
    body = await res.json();
  } catch {
    return { error: "Ogiltig JSON" };
  }

  const listings = Array.isArray(body) ? body : (body.data ?? []);
  const usable = listings.filter(
    (l) =>
      typeof l?.price === "number" &&
      (!l.type || l.type === "buy_now") &&
      (!l.state || l.state === "listed")
  );

  if (usable.length === 0) return null;

  // Listningarna kommer sorterade billigast först, men vi litar inte på det.
  usable.sort((a, b) => a.price - b.price);
  const cheapest = usable[0];

  return {
    price_eur: usdCentsToEur(cheapest.price),
    float_value: cheapest?.item?.float_value ?? null,
    wear: cheapest?.item?.wear_name ?? null,
    listings_count: usable.length,
    // Näst billigaste: om den ligger långt över den billigaste är den
    // billigaste troligen en avvikare (dålig float, udda skick).
    second_price_eur:
      usable.length > 1 ? usdCentsToEur(usable[1].price) : null,
  };
}
