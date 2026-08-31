// config.mjs
// Här justerar du vilka priser och kvantiteter verktyget ska bry sig om.
// Allt i EUR eftersom både Skinport och Steams API är enklast att jobba med i EUR.

export const CONFIG = {
  // Steams appid för CS2 (samma som CS:GO alltid varit)
  APP_ID: 730,

  // Valuta att räkna i. Skinport stödjer EUR/USD direkt.
  // Steam priceoverview-endpointen styrs av "currency"-koden nedan.
  CURRENCY_SKINPORT: "EUR",
  STEAM_CURRENCY_CODE: 3, // 3 = EUR i Steams API

  // Bara items i det här prisspannet analyseras (för att matcha din typiska
  // budget, ~800-1600 EUR ungefär motsvarande din 9-17k SEK-nivå).
  // Justera fritt.
  MIN_PRICE_EUR: 50,
  MAX_PRICE_EUR: 2000,

  // Skinport-kvantitet (antal till salu) som proxy för likviditet.
  // Ju fler till salu, desto mer "bevisat" att folk handlar den skinen.
  MIN_SKINPORT_QUANTITY: 2,

  // NYTT: minsta antal FAKTISKA försäljningar (inte bara listningar) på
  // Skinport de senaste 7 dagarna för att skinen ska räknas som verifierad.
  // Detta filtrerar bort skins där bara någon enstaka konstig listning ligger
  // ute utan att något faktiskt sålts där.
  MIN_SKINPORT_SALES_7D: 3,

  // NYTT: minsta antal sälj på Steam senaste 24h för att Steam-priset ska
  // räknas som pålitligt (annars kan lowest_price vara en ensam, ouppnåelig
  // listning).
  MIN_STEAM_VOLUME_24H: 2,

  // NYTT: hur mycket ett pris (Skinport-listning ELLER Steam lowest_price)
  // får avvika från skinens egna snittförsäljningspris senaste veckan innan
  // vi bedömer det som opålitligt (felprissatt, manipulerat, eller en
  // ovanlig variant/mönster som inte är representativ). 30 = tillåter
  // ±30% avvikelse från snittet.
  MAX_PRICE_DEVIATION_FROM_AVG_PCT: 30,

  // Hur många av de mest likvida kandidaterna som ska Steam-prischeckas
  // per körning. Steam är hastighetsbegränsat, så vi kan inte kolla allt.
  MAX_STEAM_LOOKUPS_PER_RUN: 60,

  // Paus mellan varje Steam-anrop (millisekunder). Steam blockerar dig
  // (temporärt, oftast 5-30 min) om du går för snabbt. GitHub:s servrar
  // delar IP med massor av andra användare, så vi är extra försiktiga.
  STEAM_REQUEST_DELAY_MS: 3500,

  // Steams avgift vid försäljning: Valve tar ~5% + spelets andel ~10% = ~13-15%
  // beroende på pris (avrundningsregler gör den exakta procenten lite ojämn
  // på låga priser). Vi använder en förenklad, något konservativ approximation.
  // Du får ALLTID mindre än priset köparen ser.
  STEAM_SELLER_NET_FACTOR: 0.8696, // motsvarar ca 13.04% total avgift

  // --- CSFloat ---

  // CSFloat anger priser i USD. Vi räknar i EUR. Den här kursen är FAST och
  // måste justeras manuellt när valutan rört sig märkbart (kolla t.ex. på
  // google: "usd to eur"). Ett fel här slår rakt in i CSFloat-spreaden.
  USD_TO_EUR: 0.863,

  // Hur många listningar som hämtas per skin. Vi behöver den billigaste,
  // men tar med några till för att kunna se om den billigaste är en
  // avvikare (dålig float, udda skick).
  CSFLOAT_LISTINGS_PER_ITEM: 5,

  // Paus mellan CSFloat-anrop (ms). Ett anrop per skin vi kollar.
  CSFLOAT_REQUEST_DELAY_MS: 1000,

  // Hur många toppresultat som sparas i varje riktning i output-filen.
  TOP_N_RESULTS: 50,
};
