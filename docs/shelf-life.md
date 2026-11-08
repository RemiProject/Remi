# Probable expiry dates (version 3)

Every time fresh fruit or vegetables go into the kitchen (a scanned receipt, a manual add or a received purchase
order), Remi records the purchase day and a probable expiry date for where the food is kept. The date comes from
average shelf-life figures, never a guess.

## Source

USDA FSIS **FoodKeeper**, data version 128 ("FSIS - FoodKeeper Data" on catalog.data.gov, CC0 public domain). For each
food it gives a range per storage place: pantry, refrigerator and freezer. A range counts from the date of purchase
where FoodKeeper says so.

- `backend/data/foodkeeper-produce.psv`: FoodKeeper's 102 "Produce: Fresh Fruits" and "Produce: Fresh Vegetables" rows, copied unchanged. The header records the source URL, byte size and SHA-256 of the downloaded file.
- `backend/data/shelf-life.csv`: which FoodKeeper row covers each catalogue food, 130 fresh fruits and vegetables. Judgements are noted per row, such as "casaba melon is grouped with papaya" or "molokhia counts as greens".
  - **Left out on purpose:** canned, dried, cooked, frozen and pickled foods, which follow other FoodKeeper rules.
  - **Not covered by FoodKeeper:** fig, quince, persimmon, loquat, fennel and others. These are left without an estimate rather than given a made-up figure.

The importer (`pnpm data:import`) converts ranges to days (days 1, weeks 7, months 30, years 365) and stores them in `FoodShelfLife` (migration 0031).

## How a date is chosen

- **Probable expiry** = purchase day + the **average** (midpoint) of the FoodKeeper range for where the food is kept, at noon UTC.
  - Example: apples in the fridge keep 4–6 weeks (28–42 days), so the estimate is 35 days.
- **Purchase day:** the receipt's date when it has one, otherwise today. It is stored on the batch.
- **"When ripe" foods:** FoodKeeper gives bananas, tomatoes and avocados no room-temperature number, so they get **no date** at room temperature instead of an invented one. The receipt review says "Ripens at room temperature; move it to the fridge when ripe".
- **Freezing not recommended:** lettuce and cucumber get no freezer date.
- **Moving the food:** moving an estimated batch (fridge → freezer, for example) re-estimates it from the purchase day. Apples go from 13 Dec to 6 Jul.
- **People's dates win:** a date someone types replaces the estimate and is never overwritten. `InventoryItem.expiryEstimated` records which kind each date is.
- **Food already in kitchens:** food that had no date was given one by the importer (8 batches on the development database). Dates people had entered were not touched.

## Where it shows

- **Receipt review:** each food shows "Probably good until 13 Dec (about 35 days, USDA average)", and the date moves when you change the storage place.
  - **Storage suggestion:** follows USDA: the fridge when that keeps it longer, the pantry for onions and potatoes, room temperature until ripe for bananas and tomatoes.
- **Kitchen:**
  - **List:** estimated dates read "Days until expiration: about 10".
  - **Food page:** says the date is estimated from USDA averages and shows the purchase day.
- **Everything that sorts by expiry** now includes fresh produce automatically: the Kitchen's expiry sort, Home's "Use first", recipe suggestions that use up expiring food, and first-expiring-first-used when cooking.

## Fix made along the way

Receipt scanning had suggested **Counter** for fruit. The app can show Counter but not edit it, so those foods were read-only. Room temperature is now **Pantry**, and migration 0032 moved the 7 receipt-added counter batches to Pantry.

## Checks

- **Backend:**
  - `test/unit/shelf-life.spec.ts`: averages, dates across a year end, "when ripe" and "not recommended", and the storage choice.
  - The existing receipt tests.
  - 157 tests pass.
- **App:** `scripts/test-receipt-parser.cjs` checks that the expiry preview follows storage. Every app test file passes.
- **API run** on a test account:
  - apple in the fridge → 13 Dec, estimated;
  - lettuce → 19 Nov;
  - banana at room temperature → no date;
  - apple moved to the freezer → 6 Jul 2027;
  - a typed date stays as typed.

## Limits

- **Other foods:** only fresh produce has estimates. Dairy, meat, fish and bread have FoodKeeper rows too and can be added the same way through `shelf-life.csv`.
- **Averages, not inspections:** the app says to check the food before eating it.
