# Version 3: "Sip happy" redesign, Mob-style cooking

Version 3 builds on Version 2 and its planning/onboarding work (RemiProject/Remi#24).
It changes how Remi looks and how it feels to cook with, one element at a time.
Each element is its own commit on the `version-3` branch.

- **Look:** the Mob meal-planner app's patterns: clean white photo cards, bold sans
  headings, pill buttons, horizontal recipe rails, a planner-first Home.
- **Cooking:** Mob's full-screen cook mode: one step per page, a progress bar,
  ingredients one tap away, and a screen that stays on.
- **Colour:** a new three-colour palette.

Mob is a reference for patterns only. Its copy, images, icons and fonts are not used.

## The palette

| Name | Hex | Role |
|---|---|---|
| Lemon Yellow | `#F8E45C` | **Base.** Hero areas, selected chips, highlights. In dark mode it becomes the action colour |
| Cobalt Blue | `#1734BE` | **Action.** Buttons, links, active tab, focus rings, key text. In dark mode it becomes the hero colour |
| Hot Pink | `#ED2B8C` | **Pop, used sparingly.** The quick-add button, cook-mode timer and progress, and the "to use soon" highlight. It is never used for body text on white (3.9:1). Pink text uses `#C2146C` (5.7:1) instead |

Supporting colours are derived from these hues rather than from grey:

- **Ink:** `#0E1440`.
- **Secondary text:** `#4B5070` and `#5E6383`.
- **Paper:** `#FFFDF4`.
- **Pale lemon:** `#FCF4C4`.
- **Dark mode:** navy `#0B1030`, surfaces `#151B45` and `#1E2658`.

Every text/background pair in `src/theme/tokens.ts` has been checked: body text is
at least 4.5:1 and input borders at least 3:1. The ratios are in the tokens file's
comments.

## Checklist

Legend: ✅ done · ⬜ to do

| # | Element | What changes | Status | Commit |
|---|---|---|---|---|
| 1 | Colour tokens | New palette in light and dark, plus `accent`/`accentText`/`onAccent`/`accentSoft`/`shadow` tokens | ✅ | `e18f0c3` |
| 2 | Typography | Bold DM Sans titles and headings replace DM Serif Display. The paper texture is removed | ✅ | `27ad3d3` |
| 3 | Core components | Pill buttons, chips that don't reflow when selected, white cards with soft depth, pill search | ✅ | `27ad3d3`, `598eadf` |
| 4 | Tab bar | Lemon pill behind the active tab, hot-pink quick-add button | ✅ | `0920b13`, `5ef27d8` |
| 5 | Home | Lemon hero, pink "Use first" card, recipe rail cards with depth, meal thumbnails, cobalt "Make more" card. No hard-coded colours | ✅ | `0920b13` |
| 6 | Recipe detail | Photo hero or placeholder, time/ingredients/difficulty pills, round servings stepper, Ingredients/Method switch, divided rows, numbered steps | ✅ | `187e297` |
| 7 | Cook mode | Full screen, segmented progress, swipeable steps, large text, per-step timer, ingredients view, screen kept awake | ✅ | `864f979` |
| 8 | Shopping list | Compact checkbox rows. "50 g", not "50.000 g" | ✅ | `e7bd839` |
| 9 | Onboarding and planner | Restyled through the new tokens and components. Planner shows "Dinner · 4 servings" | ✅ | `598eadf` |
| 10 | Design docs | `DESIGN.md` and `PRODUCT.md` describe the new visual world | ✅ | this commit |
| 12 | Logo | Remi mascot and wordmark on Home, startup, sign-in, the onboarding welcome and the cook-mode done card, recoloured for each theme | ✅ | this commit |
| 14 | Launch screen | Remi logo, cobalt on paper (light) and white on night (dark), matching the app background | ✅ | this commit |
| 13 | App icon | The chef's hat and face, cobalt on lemon, for iOS (Icon Composer, Liquid Glass), Android adaptive (with monochrome) and web favicon. Replaces the Expo placeholder | ✅ | this commit |
| 15 | Recipe-first UI | Cleaner screens that show more recipes, after two food-app references the user shared (see the log): 2-column recipe grid, cuisine tabs, art tiles for recipes without photos, photo-sheet recipe page | ✅ | this commit |
| 16 | Food photography | Photos for all 400 catalogue recipes and 474 ingredients from the image handoff, on cards, the recipe page, onboarding, Kitchen and Use first, with credits in More | ✅ | this commit |
| 17 | Nutrition | Recipe nutrition per serving from USDA data, with Mob-style macro boxes, labels, High protein and Under 500 kcal tabs, kcal on cards, planner day totals and a Health Today screen against goals. Plan and results in `docs/nutrition.md` | ✅ | this commit |
| 11 | Verification | Typecheck, lint and 430 tests pass. Simulator screenshots in light, dark and Arabic | ✅ | this commit |

## Log

### 1. Colour tokens (`src/theme/tokens.ts`)
- The three pinned colours are mapped to roles: lemon as base, cobalt as action, hot pink as pop.
- Dark mode swaps lemon and cobalt. Cobalt becomes the hero, and lemon the action colour on a navy `#0B1030` background.
- Added `accent` (hot pink fills such as the quick-add button and progress), `accentText` (pink that is safe for text), `onAccent`, `accentSoft` (pale pink surface) and `shadow`.
- **Checked:** every text pair was measured with a WCAG contrast script. The ratios are noted in the file.

### 2. Typography (`src/theme/fonts.tsx`, `assets/fonts/`)
- Three static cuts are generated from the bundled DM Sans variable font with fontTools:
  - Display, ExtraBold 800 (titles);
  - Heading, Bold 700;
  - Label, SemiBold 600.
- They are renamed "Remi Display/Heading/Label" as the OFL allows; DM Sans has no reserved font name. Static files render the same weight on iOS, Android and web.
- `AppText` picks the cut per variant. Arabic keeps the system font.
- DM Serif Display and the paper-grain image were deleted.

### 3. Core components (`src/components/ui/core.tsx`)
- **Buttons:** pills, 48pt tall. Secondary buttons are soft cobalt. Text buttons get tighter padding so three still fit in a row.
- **Chips:** pills that fill lemon when selected. There is no checkmark any more, so rows don't reflow (a finding from the v2 test report).
- **Cards:** white with a soft offset shadow.
- **Search:** a pill with a 1pt border.

### 4. Tab bar (`src/app/(tabs)/_layout.tsx`)
- Mob-style indicator: a lemon pill sits behind the active icon, whose label is bold ink.
- The quick-add button is hot pink.
- In dark mode the active pill is navy with a light icon. A first version had a dark icon here; it was found on the simulator and fixed.

### 5. Home (`src/screens/home-screen.tsx`, `backend-home-recipe-ideas.tsx`, `components/app-skeleton.tsx`)
- All hard-coded hex colours were replaced with tokens.
- The lemon hero carries ink type.
- "Use first" uses pale pink with a pink heading.
- Upcoming meals and "In your shopping list" rows have 56pt recipe thumbnails, like Mob's "my meals" banner. They show a placeholder when a recipe has no photo.
- The recipe rail runs edge to edge with shadowed cards.
- The startup skeleton matches the new Home.

### 6. Recipe detail (`src/screens/connected-recipes-screen.tsx`)
- The photo hero falls back to a lemon placeholder.
- Stat pills show time, ingredient count and difficulty.
- The servings stepper uses round 44pt − and + buttons.
- A segmented Ingredients/Method switch replaces two chips.
- Ingredients are divided rows (name left, amount right) in one card.
- Method steps are numbered in lemon circles.
- **Start cooking** stays pinned in the footer.

### 7. Cook mode (`src/screens/backend-cooking-screen.tsx`, `src/components/step-timer.tsx`)
The layout follows Mob's `CookModeScreen` (step pager, progress bar, ingredients and method views, wakelock):
- **Progress:** a segmented bar. Done steps are pink and the current step is cobalt; tap a segment to jump to it.
- **Steps:** one per page in a horizontal pager. Swiping and the buttons use the same session state. The step text is set at 27pt.
- **Ingredients:** Method/Ingredients switch. The ingredients view keeps the kitchen-matching statuses (have, missing, short and so on).
- **Timer:** every step with a duration gets a countdown.
  - It counts from an end time, so it stays right if the app is backgrounded.
  - It keeps running when you swipe to another step, and vibrates at zero.
  - It offers pause, resume and reset.
- **Screen:** `useKeepAwake()` keeps the display on while cooking. `expo-keep-awake@58.0.3` was added as a direct dependency. It was already in the iOS build through Expo, so no native rebuild was needed.
- **Done:** the existing "I cooked this" flow follows a lemon done card.
- **Checked:** `scripts/test-backend-recipes.cjs` was updated for the new structure. It covers step order, durations, timer, the ingredient statuses behind the switch, progress jumps, finishing, and no stock writes.

### 8. Shopping list (`src/screens/connected-shopping-screen.tsx`, `src/domain/plan-shopping.ts`)
- Each item is one 56pt row with a round checkbox. Tapping the row ticks it, and bought items are struck through. A small Remove sits at the end.
- Rows are grouped in one card per list or aisle. A 9-item list now fits on about one screen instead of three.
- `formatAmount` displays backend decimals cleanly ("50.000" → "50", "37.500" → "37.5"). It is used on the shopping, recipe and planner screens and has a unit test.

### 9. Onboarding and planner
- Onboarding needed no code changes; it picks up the new tokens and components (`Design/version-3-sip-happy/screenshots`).
- The planner's meal line now reads "Dinner · 4 servings" instead of "dinner · 4.00 servings".

### 12. Logo (`assets/brand/`, `src/components/brand.tsx`)
- The logo artwork (`assets/brand/source/remi-logo.webp`) is split into three white-on-transparent PNGs:
  - `logo.png`: mascot and wordmark, without the tagline;
  - `wordmark.png`: "Remi";
  - `mascot.png`: the chef character.
- `scripts/make-brand-assets.py` regenerates all three from the source art (numpy + Pillow). Run on the committed source, it reproduces the committed files byte for byte.
- `<Brand kind height />` recolours the art with the new `logo` token: cobalt in light mode, white in dark mode. The wordmark and full logo are announced to screen readers as "Remi"; the mascot is decorative.
- Placements:
  - **Home:** the wordmark replaces the "Remi" text in the hero, and the waving mascot sits beside "A good day to cook."
  - **Startup skeleton:** shows the wordmark.
  - **Sign-in and sign-up header:** the wordmark replaces the "r" badge and "Remi" text.
  - **Onboarding welcome:** the mascot on a lemon panel replaces the shakshuka photo.
  - **Cook-mode done card:** shows the mascot.
- **Limitation:** the mascot overlaps the tops of the letters in the original art, so those letter edges were reconstructed by hand. The tops of "e" and "m" are slightly flat as a result. A separate wordmark file from the designer would fix this; drop it into `assets/brand/`.
- **Checked:** on the iOS Simulator (Home, onboarding and done card in light; Home and onboarding in dark) and on web (sign-in, dark). New screenshots: `light-01-home.png`, `dark-01-home.png`, `light-07-onboarding-logo.png`, `light-08-cook-done-logo.png`.
- **Not done yet:** the app icon and splash screen still use the old artwork. They are native config and need a new native build.

## Screenshots

`Design/version-3-sip-happy/screenshots/`, taken on the iPhone 18 Pro simulator against the local API:

| Light | Dark | Arabic |
|---|---|---|
| `light-01-home.png`, `light-03-recipe.png`, `light-04-cook-mode.png`, `light-05-shopping.png`, `light-06-planner.png`, `light-07-onboarding-logo.png`, `light-08-cook-done-logo.png` | `dark-01-home.png`, `dark-02-cook-mode.png` | `ar-01-home.png`, `ar-02-cook-mode.png` |

### 13. App icon (`assets/remi.icon`, `assets/images/`, `scripts/make-app-icons.py`)
- The full mascot was too busy at home-screen size, so the icon uses only the hat and face, rising from the bottom edge. The strokes are thickened so the smile still reads at 60 px.
- **iOS:** a new Icon Composer bundle, `assets/remi.icon`, with a solid lemon fill and the cobalt chef as its one layer. Translucency is off so the cobalt stays solid. It replaces the Expo template `assets/expo.icon`.
- **Android:** the adaptive foreground is scaled to the visible two-thirds, on a lemon background, with a matching monochrome layer for themed icons.
- **Fallback and web:** a flat 1024 px `icon.png` and `favicon.png`.
- **Design archive:** a preview and the source files are in `Design/version-3-sip-happy/app-icon/`.
- **Native config:** the icon is native configuration, so the iOS project was regenerated with `expo prebuild` and the app rebuilt.
- **Checked:** the rebuilt app on the iPhone 18 Pro Simulator (iOS 27) shows the new icon on the home screen (`Design/version-3-sip-happy/app-icon/ios-home-screen.png`). The Android icons were checked only as rendered previews, not on a device.


### 14. Launch screen (`app.json` → `expo-splash-screen`, `assets/images/splash-icon*.png`)
- The full Remi logo (mascot and wordmark) at 180 pt wide replaces the Expo placeholder.
- **Light:** cobalt on paper `#FFFDF4`. **Dark:** white on night `#0B1030`. These are the app's own backgrounds, so the hand-off from the launch screen to the first screen doesn't flash.
- The images are generated by `scripts/make-app-icons.py` and archived in `Design/version-3-sip-happy/splash/`.
- **Checked:** on the iOS 27 Simulator after `expo prebuild` and a rebuild, in light and dark (`splash/launch-light.png`, `splash/launch-dark.png`). iOS caches launch screens: on a device that ran an older build, the old one can show until the app is reinstalled or the device restarts.
- **Found, not fixed (also on version 2):** for one frame the startup loading screen draws the wordmark under the status bar, before the safe-area insets are measured. Passing `initialWindowMetrics` to the safe-area provider would fix it.

### 15. Recipe-first UI
Studied: two food-app concept shots the user shared, plus Mob's shipped widget inventory, read from its app binary with REA and string extraction (`recipe_thumbnail_card`, `coloured_category_tile`, `search_category_button`, `functional_recipe_tile_widget`). Taken from them:

| Reference pattern | Remi version | Not taken, and why |
|---|---|---|
| 2-column photo recipe grid, time badge on the image, cuisine under the title | `RecipeCard` grid on Home (10 recipes) and in the catalogue (all 400, loaded 24 at a time) | Rating pills: Remi has no ratings, and inventing them would be fake proof |
| Category row, selected filled | Text tabs with a hot-pink dot (the second reference's meal tabs): **For you** (ranked by your Kitchen), **All**, **Quick**, then the top cuisines from `cuisineName` | Icon circles: there is no honest icon for "Egyptian" or "Lebanese" |
| Greeting and headline with one coloured word | Compact lemon header: wordmark, round account button, headline, waving mascot, search | Coloured accent word, and the small greeting label above the headline (house style: no eyebrows, no styled words) |
| Detail: full-bleed photo, floating round back button, white sheet with a grabber, 4 stat capsules | The same: time, ingredients, steps and difficulty capsules; servings stepper beside the title (second reference); ingredients with lemon bullets and bold amounts | Bookmark (Remi has no saved recipes) and calories (Remi has no per-recipe nutrition) |
| Big bottom call to action | **Start cooking** pinned at the bottom | Price or "Add to cart" |

**No photo:** 392 of the 400 recipes have no photo, so a recipe without one gets a typographic tile instead of a fork icon: its initial in Remi Display on a pale lemon, pink or cobalt field, chosen from the recipe id so it stays the same everywhere. It doesn't pretend to be a photo, and the grid still has rhythm.

**Cleaner Home:**
- The "Make more of what you have" card goes; its two links are already in the tabs and More.
- "Use first" shrinks to a slim strip.
- Order: header, Use first, Recipes, Upcoming meals, In your shopping list.

**Done:**
- **Shared pieces (`src/components/recipe-card.tsx`):**
  - `RecipeArt` shows the photo or the letter tile. The tile's colour comes from an FNV hash of the recipe id, because a plain character sum clustered every UUID on one colour.
  - `RecipeCard` puts the time badge on the picture, with the title (two lines) under it. Below the title is the cuisine; on a cuisine tab it shows servings instead, and in For you it shows the Kitchen coverage plus a pink "uses your …" note.
  - `RecipeGrid` and `useGridCardWidth` lay out two columns inside the 20 pt gutter.
  - `RecipeTabs`, plus `recipeTabs`, `filterRecipes` and `recipeMinutes`, which have unit tests in `scripts/test-recipe-grid.cjs`.
- **API:** `cuisineName` is now in the app's recipe query (the backend already served it).
- **Home:**
  - A tighter lemon header; the "Your account" pill became a round 44 pt button.
  - A slim Use first strip.
  - **Recipes**, with For you / All / Quick / cuisine tabs and up to 10 cards. When a tab has more, "See all N recipes" opens the cookbook already on that tab.
  - Upcoming meals uses the letter tiles.
  - The blue "Make more of what you have" card was removed.
- **Cookbook (`See all`):** search, tabs (up to 10 cuisines, plus From my kitchen), a recipe count, the 2-column grid, and Load more (24 at a time). It opens on the tab Home was showing (`/feature?feature=recipes&browse=cuisine:Egyptian`).
- **Recipe page:**
  - Full-bleed picture (300 pt with a photo, 220 pt with a letter tile) and a floating round back button.
  - A sheet with a grabber.
  - The title and cuisine, with the servings stepper beside them.
  - Four lemon stat capsules.
  - Ingredients with pink bullets and bold amounts; numbered directions.
  - The actions, and **Start cooking** pinned at the bottom.
  - Once the picture scrolls away, a plain bar with the recipe name fades in over 160 ms (instant with Reduce Motion), so text never runs under the status bar.
- **Checked:**
  - On the iPhone 18 Pro Simulator in light, dark and Arabic: Home on For you and All, the cookbook on the Egyptian tab (190 recipes), and the recipe page at the top and scrolled.
  - `tsc`, `eslint` and 433 tests pass.
  - Screenshots: `light-09`…`light-12`, `dark-03`, `ar-03` in `Design/version-3-sip-happy/screenshots`.
- **From my kitchen** (`backend-recipes-screen.tsx`, reached from For you → See all) now uses the same grid.
  - Each card keeps what the list showed: the Kitchen coverage, missing and expired ingredients (two lines each), the pink "uses your …" expiry note, and a warning badge when the recipe trips a dietary safety rule. Arabic captions stay right-to-left.
  - The only change to what the card shows is the "15 min · Easy · Servings: 4" metadata line. Time moved to the badge on the picture, and difficulty and servings are on the recipe page.
  - The recipe detail screen in the same file keeps its placeholder.
  - Checked on the simulator (`light-13-from-my-kitchen-grid.png`); tests updated, and all 433 pass.

### 16. Food photography
Source: the Remi v3 image handoff (`START-HERE-CLAUDE.md`, `image-map.json`, `manifest.json`).
- Delivered: 874 reviewed images (all 400 recipes and 474 ingredients). The 326 remaining ingredients are still to be generated.
- 873 photos are AI-generated; one (garlic) is a CC BY-SA photograph.

**Done:**
- **Import (`mobile-app/scripts/import-food-images.py`):**
  - Verifies each master's SHA-256 and uses only `generated_reviewed` / `sourced_reviewed` entries.
  - Writes WebP copies to `assets/food/`: recipes 800 px, ingredients 256 px, about 30 MB in all.
  - Generates `src/data/food-images.ts`.
- **Matching:**
  - Recipes: `recipe_key` → catalogue name (`recipes.csv`) → lower-cased name, the same key the backend importer upserts on. All 400 recipes in the local database resolve.
  - Ingredients: exact food name, Arabic name and aliases. 474 of the database's 851 foods resolve.
- **Recipes:**
  - `RecipeArt` (cards, the recipe page hero, Upcoming meals), the recipe detail placeholder and onboarding's recipe picks show the photo through one `recipeImage()` lookup.
  - Lookup order: the catalogue photo first, then the old bundled cookbook photo, then the letter tile.
- **Ingredients:**
  - `ingredientImage()` now reads the generated map, replacing the 4-photo regex and its PNGs.
  - Kitchen rows (64 pt) and the Use first strip (36 pt) show the photo cropped to fill a rounded square. Before, it was letterboxed.
- **Credits:**
  - More now notes that dish and ingredient photos are AI-generated illustrations, and links the garlic photograph's author and licence.
  - The More version label now reads Version 3.
- **Checked:**
  - On the simulator: Home, the recipe page, Kitchen, the cookbook, and More in light and dark, plus the cookbook in Arabic.
  - `tsc` passes, and 435 tests pass. They include a new map check (`test-food-images.cjs`: every file exists and every catalogue recipe has a photo) and a lookup test.
  - Screenshots: `light-14`…`light-16`.
- **Archive:** `Design/version-3-sip-happy/food-photography/`.

### 17. Nutrition
Full evaluation, plan, results and rules: [`docs/nutrition.md`](docs/nutrition.md).

From Mob's binary: per-serving recipe nutrition shown as nutrient boxes, nutrition labels, meal-plan goals, and generated low-calorie or high-protein adaptations. Remi already had USDA data for 676 foods, meal logging with daily totals, and goals, but recipes showed no nutrition.

- **Data:** 31 USDA SR Legacy foods added, each with its FDC ID and pulled by script from the official CSVs. Fibre and sugar may now be empty when USDA doesn't report them (migration 0030), so a missing value is never stored as 0. Fully costed recipes went from 233 to 371 of 400.
- **API:** `nutrition` on every recipe (list, detail and suggestions page) gives calories, protein, carbs, fat, fibre, sugar and sodium per serving. It uses the meal-logging unit maths and reports coverage plus which nutrients are lower bounds.
- **App:**
  - **Recipe page:** a Nutrition section with calories, % of your goal, the energy bar, macro boxes, fibre/sugar/sodium rows, labels, and a coverage and source note.
  - **Recipe cards:** kcal on every card.
  - **Tabs:** High protein and Under 500 kcal.
  - **Planner:** day totals.
  - **Health:** Today as progress bars against your goals, plus 7 days.
- **Not done:** generated recipe adaptation, saturated fat and a goal-driven plan generator (reasons in the doc).

### 18. Receipt scanning
Research, plan, results and rules: [`docs/receipt-scanning.md`](docs/receipt-scanning.md).

Remi used to read a receipt photo as plain text, and the person picked one line at a time. Now it understands the receipt and adds the foods to the kitchen in one step.

- **Reading:**
  - A native Vision module returns each text line with its position, reads English and Arabic, and respects photo orientation.
  - The app rebuilds printed rows (straightening tilted photos) and splits header, items and totals.
  - It reads quantities, weights, pack sizes and discounts.
  - It leaves out bags, fees and household goods, and checks the items against the printed total.
- **Matching:** `matchReceiptItems` matches each cleaned name against catalogue names, aliases and product names by trigram similarity. Unsure matches are flagged; unknown lines are left out.
- **Adding:** `receiveReceipt` adds every confirmed line as a purchase batch in one transaction, dated from the receipt. A retry adds nothing twice.
- **Review screen:** foods grouped by category, each showing its receipt line, the amount, a suggested storage place and what you already have, all editable.
- **Not done:** Android layout-aware OCR, expiry dates and price history (reasons in the doc).

## Design archive

`Design/` keeps each version's colour board, `palette.json`, fonts, logo, photography and screenshots (version 1, 2 and 3). Rebuild the boards with `python3 Design/tools/make_color_boards.py`.

## Still to do (next iterations)

- **Remaining ingredient photos:** 326 ingredients still need images (the handoff's generation resumes after its usage reset). Re-run `scripts/import-food-images.py` when they arrive.
- **Ingredient photos on the recipe page:** the ingredient list still uses pink bullets; small photos could replace them now that 474 exist.
- **Bundle size:** the photos add about 30 MB to the app. If that matters for release, serve them from the backend or a CDN instead.
- **Arabic swipe direction:** in Arabic the progress bar runs right to left, but the step pager still swipes like English. Mirror the pager in RTL.
- **Timer and ingredients view:** switching to the Ingredients view unmounts the step pages, so a running timer stops. Lift timer state into the screen, or keep the pager mounted and hidden.
- **Home "Dish of the day":** a large Mob-style "Cook tonight" photo hero card that leads the rail. Every recipe now has a photo, so this is unblocked.
- **Shopping header:** the three stacked actions at the top (quick list, this week's meals, add item) could become one row of icon pills, with the list moved up.
- **Screens not reviewed one by one:** Kitchen, food detail, auth, health, household, quick add, settings. They inherit the palette, type and components, and the ones opened looked right, but each still needs a visual pass.
- **Not covered:** Android, physical devices and VoiceOver.
