// update-data.mjs
//
// Vad gör det här skriptet?
// 1. Hämtar HELA Skinports prislista (ett enda gratis API-anrop, ingen nyckel behövs)
// 2. Hämtar Skinports försäljningshistorik (verifierade sälj, inte bara listningar)
// 3. Filtrerar fram items i din prisklass med verifierad likviditet
// 4. Kollar Steam-priset för de mest lovande kandidaterna (försiktigt, ett i taget)
// 5. Räknar ut spread i båda riktningar:
//    a) Köp på Skinport -> sälj på Steam (klassisk uppgraderingsstrategi)
//    b) Köp på Steam (med wallet-pengar) -> sälj på Skinport (frigöra pengar igen)
// 6. Sparar resultatet som data/results.json
//
// Körs av GitHub Actions var 30:e minut. Ingen hemlig nyckel krävs för
// Skinport eller Steam i det här steget.

import { writeFile, mkdir, readFile } from "node:fs/promises";
import { CONFIG } from "./config.mjs";

async function readPreviousResults() {
  try {
    const raw = await readFile("data/results.json", "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const SKINPORT_URL = `https://api.skinport.com/v1/items?app_id=${CONFIG.APP_ID}&currency=${CONFIG.CURRENCY_SKINPORT}`;
const SKINPORT_SALES_URL = `https://api.skinport.com/v1/sales/history?app_id=${CONFIG.APP_ID}&currency=${CONFIG.CURRENCY_SKINPORT}`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchSkinportItems() {
  console.log("Hämtar Skinport-katalogen...");
  const res = await fetch(SKINPORT_URL, {
    headers: { "Accept-Encoding": "br" },
  });
  if (!res.ok) {
    throw new Error(`Skinport svarade ${res.status}: ${await res.text()}`);
  }
  const items = await res.json();
  console.log(`Fick ${items.length} items från Skinport.`);
  return items;
}

async function fetchSkinportSalesHistory() {
  console.log("Hämtar Skinports försäljningshistorik (verifierade sälj)...");
  const res = await fetch(SKINPORT_SALES_URL, {
    headers: { "Accept-Encoding": "br" },
  });
  if (!res.ok) {
    throw new Error(`Skinport sales-history svarade ${res.status}: ${await res.text()}`);
  }
  const sales = await res.json();
  // Bygg upp en snabb-slagbar karta: market_hash_name -> försäljningsdata
  const map = new Map();
  for (const entry of sales) {
    map.set(entry.market_hash_name, entry);
  }
  console.log(`Fick försäljningshistorik för ${map.size} items.`);
  return map;
}

async function fetchSteamPrice(marketHashName) {
  const url = new URL("https://steamcommunity.com/market/priceoverview/");
  url.searchParams.set("appid", String(CONFIG.APP_ID));
  url.searchParams.set("currency", String(CONFIG.STEAM_CURRENCY_CODE));
  url.searchParams.set("market_hash_name", marketHashName);

  try {
    const res = await fetch(url, {
      headers: {
        // Steam är känsligt för anrop utan User-Agent, ge den en normal en.
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (res.status === 429) {
      console.warn("Steam rate-limitade oss (429). Avbryter Steam-koll för denna körning.");
      return { rateLimited: true };
    }

    if (!res.ok) {
      return { error: `HTTP ${res.status}` };
    }

    const data = await res.json();
    if (!data.success) {
      return { error: "Inget pris hittades (item finns troligen inte på Steam Market)" };
    }

    // Steam returnerar strängar som "123,45€" - vi behöver bara siffrorna.
    const parsePrice = (str) => {
      if (!str) return null;
      const cleaned = str.replace(/[^\d,.-]/g, "").replace(",", ".");
      const value = parseFloat(cleaned);
      return Number.isFinite(value) ? value : null;
    };

    return {
      lowestPrice: parsePrice(data.lowest_price),
      medianPrice: parsePrice(data.median_price),
      volume: data.volume ? parseInt(data.volume.replace(/\D/g, ""), 10) : null,
    };
  } catch (err) {
    return { error: err.message };
  }
}

function steamSellerNet(steamBuyerPrice) {
  if (steamBuyerPrice == null) return null;
  return Math.round(steamBuyerPrice * CONFIG.STEAM_SELLER_NET_FACTOR * 100) / 100;
}

async function main() {
  const startedAt = new Date().toISOString();

  const previous = await readPreviousResults();
  const previousOffset = previous?.rotation_offset ?? 0;

  const skinportItems = await fetchSkinportItems();
  const salesHistory = await fetchSkinportSalesHistory();

  // Filtrera till items inom din prisklass, med rimlig listnings-likviditet,
  // OCH med verifierade faktiska försäljningar senaste veckan (inte bara
  // en ensam listning som kanske aldrig säljs).
  const allCandidates = skinportItems
    .filter((item) => {
      const price = item.min_price ?? item.suggested_price;
      if (price == null || price < CONFIG.MIN_PRICE_EUR || price > CONFIG.MAX_PRICE_EUR) return false;
      if ((item.quantity ?? 0) < CONFIG.MIN_SKINPORT_QUANTITY) return false;

      const sales = salesHistory.get(item.market_hash_name);
      const sales7d = sales?.last_7_days?.volume ?? 0;
      if (sales7d < CONFIG.MIN_SKINPORT_SALES_7D) return false;

      return true;
    })
    // Mest likvida (flest till salu) först - de är rimligast att faktiskt kunna
    // köpa/sälja snabbt.
    .sort((a, b) => (b.quantity ?? 0) - (a.quantity ?? 0));

  // Rotation: varje körning börjar där förra körningen slutade, så vi bygger
  // upp täckning över hela listan istället för att alltid kolla samma topp-N.
  const offset = previousOffset % Math.max(allCandidates.length, 1);
  const candidates = [
    ...allCandidates.slice(offset),
    ...allCandidates.slice(0, offset),
  ].slice(0, CONFIG.MAX_STEAM_LOOKUPS_PER_RUN);

  console.log(`${candidates.length} kandidater valda för Steam-koll (offset ${offset}).`);

  const results = [];
  let rateLimitHit = false;

  for (const item of candidates) {
    if (rateLimitHit) break;

    const steamResult = await fetchSteamPrice(item.market_hash_name);
    if (steamResult.rateLimited) {
      rateLimitHit = true;
      break;
    }
    if (steamResult.error) {
      await sleep(CONFIG.STEAM_REQUEST_DELAY_MS);
      continue;
    }

    const skinportPrice = item.min_price ?? item.suggested_price;
    const steamBuyerPrice = steamResult.lowestPrice ?? steamResult.medianPrice;
    const steamNet = steamSellerNet(steamBuyerPrice);
    const steamVolume = steamResult.volume ?? 0;

    // Kräver verifierad Steam-volym också - en ensam listning utan omsättning
    // räknas inte som ett pålitligt pris.
    if (steamVolume < CONFIG.MIN_STEAM_VOLUME_24H) {
      await sleep(CONFIG.STEAM_REQUEST_DELAY_MS);
      continue;
    }

    const sales = salesHistory.get(item.market_hash_name);

    if (skinportPrice && steamNet) {
      // Riktning A: köp på Skinport, sälj på Steam (du får steamNet i wallet)
      const spreadBuyExternalSellSteamPct =
        ((steamNet - skinportPrice) / skinportPrice) * 100;

      // Riktning B: köp på Steam (wallet), sälj på Skinport (du får skinportPrice kontant)
      // Här jämför vi mot steamBuyerPrice (det du faktiskt betalar som köpare på Steam)
      const spreadBuySteamSellExternalPct =
        ((skinportPrice - steamBuyerPrice) / steamBuyerPrice) * 100;

      results.push({
        name: item.market_hash_name,
        skinport_price_eur: skinportPrice,
        skinport_quantity: item.quantity,
        skinport_sales_7d: sales?.last_7_days?.volume ?? 0,
        skinport_sales_30d: sales?.last_30_days?.volume ?? 0,
        skinport_avg_price_7d_eur: sales?.last_7_days?.avg ?? null,
        steam_buyer_price_eur: steamBuyerPrice,
        steam_seller_net_eur: steamNet,
        steam_volume_24h: steamVolume,
        spread_buy_skinport_sell_steam_pct: Math.round(spreadBuyExternalSellSteamPct * 10) / 10,
        spread_buy_steam_sell_skinport_pct: Math.round(spreadBuySteamSellExternalPct * 10) / 10,
        item_page: item.item_page ?? null,
      });
    }

    await sleep(CONFIG.STEAM_REQUEST_DELAY_MS);
  }

  // Slå ihop med tidigare resultat: nya priser för samma item ersätter
  // gamla, men items vi inte hann kolla den här gången behålls kvar.
  const previousItems = previous?.all_checked_items ?? [];
  const merged = new Map();
  for (const item of previousItems) merged.set(item.name, item);
  for (const item of results) merged.set(item.name, { ...item, checked_at: startedAt });
  const allResults = [...merged.values()];

  const bestBuyExternalSellSteam = [...allResults]
    .sort((a, b) => b.spread_buy_skinport_sell_steam_pct - a.spread_buy_skinport_sell_steam_pct)
    .slice(0, CONFIG.TOP_N_RESULTS);

  const bestBuySteamSellExternal = [...allResults]
    .sort((a, b) => b.spread_buy_steam_sell_skinport_pct - a.spread_buy_steam_sell_skinport_pct)
    .slice(0, CONFIG.TOP_N_RESULTS);

  const output = {
    generated_at: startedAt,
    finished_at: new Date().toISOString(),
    rate_limited_by_steam: rateLimitHit,
    items_checked_this_run: results.length,
    items_checked_total: allResults.length,
    candidates_considered: candidates.length,
    rotation_offset: offset + candidates.length,
    config_snapshot: {
      min_price_eur: CONFIG.MIN_PRICE_EUR,
      max_price_eur: CONFIG.MAX_PRICE_EUR,
      steam_seller_net_factor: CONFIG.STEAM_SELLER_NET_FACTOR,
    },
    top_buy_skinport_sell_steam: bestBuyExternalSellSteam,
    top_buy_steam_sell_skinport: bestBuySteamSellExternal,
    all_checked_items: allResults,
  };

  await mkdir("data", { recursive: true });
  await writeFile("data/results.json", JSON.stringify(output, null, 2));
  console.log(`Klart. ${results.length} items sparade i data/results.json.`);
}

main().catch((err) => {
  console.error("Skriptet kraschade:", err);
  process.exit(1);
});
