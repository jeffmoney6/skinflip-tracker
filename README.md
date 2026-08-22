# skinflip-tracker

Hittar prisskillnader mellan Skinport (andrahandsmarknad) och Steam Community
Market för CS2-skins, i din prisklass. Tänkt att köras automatiskt via GitHub
Actions och visas i en Claude-dashboard (artifact).

## Hur det funkar

1. `scripts/update-data.mjs` hämtar hela Skinports prislista (gratis, ingen
   nyckel behövs), filtrerar fram items i din prisklass med rimlig
   likviditet, och kollar Steam-priset för de mest lovande kandidaterna.
2. Resultatet sparas i `data/results.json`.
3. `.github/workflows/update-prices.yml` kör steg 1 automatiskt var 30:e
   minut och pushar den uppdaterade filen till repot.
4. En dashboard (byggd i Claude) läser `data/results.json` direkt från
   GitHub och visar det snyggt, med sortering och grafer.

## Kom igång (5 minuter)

1. Skapa ett nytt repo på GitHub (t.ex. `skinflip-tracker`), publikt eller
   privat spelar ingen roll.
2. Ladda upp alla filer i den här mappen till repot (behåll mappstrukturen,
   `.github`-mappen är viktig).
3. Gå till fliken **Actions** i ditt repo. Om Actions inte redan är
   aktiverat, klicka igång det.
4. Kör workflowet manuellt en gång för att testa: Actions →
   "Update skin prices" → "Run workflow".
5. Efter ~1 minut ska `data/results.json` innehålla riktig data (kolla att
   filen uppdaterats i repot).
6. Skicka din raw GitHub-URL till Claude, den ser ut såhär:
   `https://raw.githubusercontent.com/ANVÄNDARNAMN/REPO-NAMN/main/data/results.json`
   (byt `ANVÄNDARNAMN` och `REPO-NAMN`)

Claude bygger sen dashboarden som läser den länken.

## Justera vad som analyseras

Öppna `scripts/config.mjs`:

- `MIN_PRICE_EUR` / `MAX_PRICE_EUR` – vilket prisspann du handlar i
- `MIN_SKINPORT_QUANTITY` – hur "bevisat likvid" en skin måste vara för att
  räknas med
- `MAX_STEAM_LOOKUPS_PER_RUN` – hur många items som Steam-priskollas per
  körning (för högt värde = risk för rate-limit)
- `STEAM_SELLER_NET_FACTOR` – Steams ungefärliga avgift (du får aldrig hela
  köparpriset, ca 13% försvinner)

## Nästa steg: lägg till CSFloat

CSFloat kräver en gratis API-nyckel (csfloat.com → din profil →
"Developer"-fliken). När du har en:

1. Lägg den som en **secret** i ditt GitHub-repo: Settings → Secrets and
   variables → Actions → "New repository secret" → namnge den
   `CSFLOAT_API_KEY`.
2. Säg till Claude, så byggs `scripts/fetchCsfloat.mjs` och kopplas in i
   `update-data.mjs`.

CSFloat ger dig enskilda listningar (inte bara snittpris), vilket är bättre
för att hitta *specifika* undervärderade objekt att lägga bud på.

## Viktigt att komma ihåg

- Steams "pris" i den här datan är vad **köparen** betalar. Det du själv får
  som säljare är lägre (~13% avgift), vilket redan är inräknat i
  spread-beräkningarna.
- Pengar från en Steam-försäljning går till din Steam Wallet – de går inte
  att ta ut som riktiga pengar, bara användas till nya köp på Steam. Det är
  därför verktyget visar två riktningar: köp externt→sälj Steam, OCH köp
  Steam→sälj externt (för att frigöra wallet-pengarna igen).
- Det här är marknadsdata, inte en garanti. Priser rör sig, listningar kan
  försvinna innan du hinner agera, och Steam-avgiften är en approximation.
