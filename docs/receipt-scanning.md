# Receipt scanning in Remi (version 3)

Photograph a shop receipt, and Remi reads which foods were bought, how much, and adds them to the kitchen.
It has to understand the receipt's layout so that shop details, totals, tax, payment, bags and household goods
are never mistaken for food. Status marks: ✅ done · ⬜ to do · ✖ deliberately not done.

## 1. What the best apps do

Pantry apps that scan grocery receipts, from their store listings and reviews (November 2026). No source tested
their accuracy side by side, so these are the vendors' own descriptions:

| App | What it does with a receipt | Takeaway for Remi |
|---|---|---|
| Pantri | Matches each receipt line to an item already in the pantry, so a "Coffee Pods 12ct" purchase updates the existing "coffee"; sorts by aisle and category | Update what you have; don't create duplicates |
| Pantry Buddy | Photo of a receipt, then the items are added to the pantry list | One photo, then add |
| PantryPal / Pantry Check | Receipt and barcode scanning into the pantry | — |
| FridgeWise | Receipt photos and shared household lists. One report says shelf-stable items are sometimes put in the fridge, which breaks expiry tracking | Storage must be a suggestion the person can change |
| Expireless (Android) | Claims 20–40 items from one photo in under 30 seconds | Speed matters; review must be quick |
| Fetch (rewards) | The largest receipt scanner; mature line-item reading, but no pantry | — |

What separates a good scanner from a bad one comes down to four things:

1. **It reads the layout**, not a flat list of words. Name and price are printed on one row but come back from OCR as separate pieces.
2. **It knows the parts of a receipt.** Header (shop, address, phone, tax number, date), item lines, then subtotal, tax, total, payment, change and footer.
3. **It decides what is food.** Bags, deposits, delivery fees, detergent and tissues sit among the items.
4. **It updates the pantry instead of duplicating**, and lets the person correct anything before saving.

### Shipped-app inspection (REA)

ReciMe, already on this Mac, was checked first: all 250 of its "receipt" strings are App Store purchase receipts
(RevenueCat, Superwall), not food receipts. Pantri was chosen to inspect next, but it has not been installed on this Mac, so **no receipt app has been inspected with REA yet**. The design above rests on the published app descriptions and on testing real receipts (section 6).

## 2. What Remi had

- **Text recognition:** `expo-text-extractor` (Apple Vision on iOS, ML Kit on Android) returned plain lines with no positions. It ignored the photo's orientation tag and read English only.
- **Review:** the screen listed every line that had a letter in it. The person picked one line at a time, searched the catalogue and filled a form. Nothing was interpreted: no quantities, prices or sizes.
- **Inventory:** a batch ledger (`InventoryItem` + `InventoryTransaction`) with idempotent adds. `receiveStock` existed for purchases but nothing called it.
- **Catalogue:** 851 foods in 20 categories, 2,064 English and Arabic aliases, 79 packaged products, and Postgres trigram search (`pg_trgm`) installed but unused.

## 3. Plan

### Reading the receipt
| | Task | Status |
|---|---|---|
| R1 | A native Vision module (`modules/receipt-vision`) that returns every line with its position, respects the photo's orientation, and reads English and Arabic. Arabic is listed first with language detection on: with English first, Vision reads Arabic script as Latin letters. Language correction is off so abbreviations and codes stay as printed | ✅ |
| R2 | Rebuild printed rows from positions: straighten a tilted photo using the text's own angle, then join boxes on one baseline, left to right | ✅ |
| R3 | Split the receipt into header, items and totals. The item block starts at the first priced line (or a name or department heading just above it) and ends at the first subtotal or total | ✅ |
| R4 | Read each item line: price at the end (or start, for Arabic rows read left to right), tax-flag letters, `2 x 38.00`, `3 @ 1.50`, weighed `1.235 kg @ 12.50/kg`, pack size `1L` `500G` `30PCS` `4X125G` `8OZ`, item codes. Join a name to a quantity or price printed on the next row, and long names the till wrapped onto two rows | ✅ |
| R5 | Discounts attach to the item above. Department headings ("PRODUCE", "DAIRY") are remembered for the items below | ✅ |
| R6 | Arabic-Indic digits and separators, Arabic keywords (الإجمالي، ضريبة، مدى، الباقي، شكراً…), EGP/SAR/AED/… currency marks | ✅ |
| R7 | Purchase date: day-first or month-first, whichever reading is real, not in the future and closest to today | ✅ |
| R8 | Check the items against the printed subtotal or total and say whether they add up | ✅ |

### Deciding what is food
| | Task | Status |
|---|---|---|
| F1 | Never food: header, totals, tax, payment, change, loyalty, footer, phone, address, tax number, cashier, receipt number | ✅ |
| F2 | Not food among the items: bags, deposits, delivery and service fees (shown as "Bag or fee"); detergent, tissues, soap, foil, batteries, nappies, pet food and so on, in English and Arabic (shown as "Not food") | ✅ |
| F3 | Match the cleaned name to the catalogue on the server: trigram similarity against food names, English and Arabic aliases, and packaged product names. Brand-only lines that match nothing ("Pringles") are not guessed | ✅ |
| F4 | Confidence: a confident match is preselected; a short food name inside a long line ("cream" in "full cream milk") is flagged "Check this match"; no match is left out unless the person picks a food | ✅ |
| F5 | Expand till abbreviations before matching (`CHKN BRST BNLS` → chicken breast boneless, `FRZN`, `WHL MLK`, `MOZZ`…) and add receipt aliases to the catalogue (`full cream milk`, `fresh milk`, `milk` → whole milk) | ✅ |

### Adding to the kitchen
| | Task | Status |
|---|---|---|
| K1 | Review grouped by food category, each line showing the receipt text it came from | ✅ |
| K2 | Amount from the receipt: weighed amount, or count × pack size, or a count of pieces for foods sold by the piece. When the receipt doesn't say (rice with no size), the person enters it, and nothing is sent until they do | ✅ |
| K3 | Suggested storage from category and name (dairy and meat to the fridge, onions and potatoes to the pantry, bananas on the counter, frozen to the freezer), always changeable | ✅ |
| K4 | Show what the kitchen already holds of each food ("In your kitchen: 500 g"), so a purchase visibly updates it | ✅ |
| K5 | Add everything in one transaction (`receiveReceipt`), recorded as a purchase with the receipt's date. Retrying with the same key adds nothing twice | ✅ |
| K6 | Change a match, choose a food for an unmatched line, or mark a line as not food | ✅ |
| K7 | Type or paste a receipt when the camera can't be used | ✅ |
| K8 | English and Arabic copy; light and dark | ✅ |

### Not done, and why
| | Item | Why |
|---|---|---|
| ✖ | Android Vision-quality layout | Android still uses ML Kit through `expo-text-extractor`, which returns lines without positions; Remi ships on iOS. A Kotlin twin of `receipt-vision` is the upgrade |
| ✅ | Expiry dates for receipt purchases | Receipts don't print them, so fresh produce gets a probable date from USDA FoodKeeper averages for where it is kept, shown in the review. See `docs/shelf-life.md` (added after this plan) |
| ✖ | Prices and spending history | Out of scope for the kitchen; prices are read only to check the total |
| ✖ | Sending photos to an AI service | Receipts stay on the phone; only the cleaned item names go to Remi's own server |

## 4. How it works

```
photo ─► receipt-vision (Apple Vision, positions)
      ─► rowsFromLines   straighten, join name + price per printed row
      ─► parseReceipt    header | items | totals; quantities, sizes, weights, discounts; non-food out
      ─► matchReceiptItems (server)  trigram match → food, category, storage, what you already have
      ─► review          include / amount / unit / storage / change food
      ─► receiveReceipt (server)     one transaction, idempotent, PURCHASE_RECEIPT batches
```

**Code:**
- **App:**
  - `modules/receipt-vision/` (native module)
  - `src/domain/receipt-parser.ts`
  - `src/domain/receipt-review.ts`
  - `src/services/receipt-api.ts`
  - `src/services/receipt-ocr-core.ts`
  - `src/screens/intake-receipt-screen.tsx`
  - `src/i18n/receipt-review.ts`
- **Backend:**
  - `src/modules/receipts/` (matching, storage rules, resolver)
  - `InventoryLedgerService.receiveWithinTransaction`

## 5. Results

**An Arabic receipt photo** (`scripts/fixtures/receipt-vision-arabic.json`), read in the Arabic dark UI:
- The shop, the date (5 November) and all 5 foods were read, with sizes, and matched to tomato, whole milk (لبن), basmati rice, chicken breast and labneh.
- Tissues, the bag, tax, the total and the mada payment were left out.
- The items add up to the printed total, 96.00.

**A photographed receipt.** A tilted receipt photo was run through Apple Vision; its output is kept as `scripts/fixtures/receipt-vision-tilted.json`:
- Every price was joined to its own name.
- All 9 food lines were read with the right quantities and sizes.
- Tissues, detergent and the carrier bag were left out.
- The items add up to the printed total, 1,229.44.

**Live matching**, on the same receipt's items:

| Receipt line | Food | Category, storage |
|---|---|---|
| TOMATOES LOOSE 1.235 kg | tomato | Vegetables, fridge |
| JUHAYNA FULL CREAM MILK 1L, 2 x 38.00 | whole milk (2 L) | Dairy, fridge |
| CHKN BRST BNLS 1KG | chicken breast | Poultry, fridge |
| BALADI BREAD 5 PCS | baladi bread | Grains, pantry |
| EGGS WHITE 30PCS | chicken egg (30) | Eggs, fridge |
| AMERICANA FRZN MIXED VEG 400G | frozen mixed vegetables | Vegetables, freezer |
| ISIS TAHINI 300G | tahini | Pantry |
| NESCAFE CLASSIC 200G | instant coffee (via the product list) | Pantry |
| PRINGLES ORIGINAL 165G | no match, left out unless chosen | — |

**Tests:**
- **Receipt parsing and review** (`scripts/test-receipt-parser.cjs`): 14 tests, including the Whole Foods receipt from both OCR engines, covering English, Arabic and US receipts, quantity rows above and below, wrapped names, discounts, departments, mismatched totals, real Vision output of a tilted English photo and an Arabic photo, and the review rules.
- **OCR service:** `scripts/test-receipt.cjs`.
- **Backend:** `test/unit/receipt-match.spec.ts`.
- **API run:** adding a receipt and retrying it added nothing twice, and a negative amount was rejected.
- **On the simulator:** the full flow, from photo to review to "Added 9 foods", ended with all 9 purchase batches in the database under the receipt's date. A non-receipt photo (a leaf) gave "couldn't read this photo" and no foods. Screenshots: `light-21-receipt-review.png` and `ar-dark-05-receipt-review.png` in `Design/version-3-sip-happy/screenshots/`.
- **Catalogue aliases added** for receipts: `full cream milk`, `fresh milk` and `milk` for whole milk, and the Arabic plurals صدور دجاج، أوراك دجاج، أجنحة دجاج.

## 6. First real receipt (Whole Foods, from the phone)

The first receipt scanned on the phone added nothing:
- **The add was never sent.** The server log shows the receipt was matched twice, but no add request followed.
- **The "Add" pill was the cause.** Each food had a yellow pill labelled "Add" that looked like an action but actually switched the food to "Skip". The real add button sat at the bottom of a long list.
- **The receipt also broke the parser** in six ways:
  - multi-buy prices ("2 @ 5 for $3.00");
  - "lb" read by the OCR as "1b" or "ID";
  - "Tare Weight" rows read as items;
  - the brand "365 L" read as 365 litres;
  - the logo split into "WHOLE" / "FOODS®" / "MARKET";
  - till codes OG, CV, CKN, ROTI, PLN and BRW.
- **"romaine heart" matched beef heart.** It was an unsure match, but unsure matches were ticked by default.

Fixes:

| | Fix |
|---|---|
| UI | A checkbox replaces the pill. The add button and a one-line explanation sit at the top, under the summary. Unsure matches start unticked. Foods with an amount are added straight away; the rest stay on screen to fill in or untick |
| Parser | Multi-buy prices; "1b", "Ib" and "ID" after a number or slash read as lb; tare and net-weight rows ignored; ®, ™ and © stripped; a logo split one word per row joined into one name; pack sizes capped at believable values; more till abbreviations. A count is only trusted when printed, so "BRW EGG $2.99" asks how many instead of assuming 1 egg |
| Catalogue | `romaine`, `romaine heart` → lettuce; `black bean` → black beans |

Result: both the Mac's and the phone's OCR of this receipt now give "WHOLE FOODS MARKET", 16 items and an exact match with the $49.62 subtotal. Both are kept as fixtures (`receipt-vision-wholefoods.json`, `receipt-rows-wholefoods-ios.json`).

## 7. Rules

- **Nothing is added without confirmation.** Uncertain matches are flagged, unknown lines are left out, and amounts are never invented.
- **Every skipped line is shown with its reason**, so a wrong skip can be seen.
- **Receipt photos stay on the phone.** The server receives only cleaned item names and the confirmed foods.
