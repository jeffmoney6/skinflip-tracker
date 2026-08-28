// config.mjs
export const CONFIG = {
  APP_ID: 730,

  CURRENCY_SKINPORT: "EUR",
  STEAM_CURRENCY_CODE: 3,

  MIN_PRICE_EUR: 15,
  MAX_PRICE_EUR: 2000,

  MIN_SKINPORT_QUANTITY: 2,

  // Minsta antal FAKTISKA försäljningar på Skinport senaste 7 dagarna.
  MIN_SKINPORT_SALES_7D: 3,

  // Minsta antal sälj på Steam senaste 24h.
  MIN_STEAM_VOLUME_24H: 2,

  // Hur mycket ett pris får avvika från skinens egna snittförsäljningspris
  // innan vi bedömer det som opålitligt (felprissatt/manipulerat/ovanlig
  // variant). 30 = tillåter ±30% avvikelse.
  MAX_PRICE_DEVIATION_FROM_AVG_PCT: 30,

  MAX_STEAM_LOOKUPS_PER_RUN: 30,
  STEAM_REQUEST_DELAY_MS: 3500,

  STEAM_SELLER_NET_FACTOR: 0.8696,

  TOP_N_RESULTS: 50,
};
