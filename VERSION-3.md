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

## Design archive

`Design/` keeps each version's colour board, `palette.json`, fonts, logo, photography and screenshots (version 1, 2 and 3). Rebuild the boards with `python3 Design/tools/make_color_boards.py`.

## Still to do (next iterations)

- **Recipe photos:** the local database has no recipe photos, because the cookbook seed only runs against `remi_cookbook`. Photo cards, the recipe hero and thumbnails were checked only in their placeholder state.
- **Arabic swipe direction:** in Arabic the progress bar runs right to left, but the step pager still swipes like English. Mirror the pager in RTL.
- **Timer and ingredients view:** switching to the Ingredients view unmounts the step pages, so a running timer stops. Lift timer state into the screen, or keep the pager mounted and hidden.
- **Home "Dish of the day":** a large Mob-style "Cook tonight" photo hero card that leads the rail. It needs the photo pipeline first.
- **Shopping header:** the three stacked actions at the top (quick list, this week's meals, add item) could become one row of icon pills, with the list moved up.
- **Screens not reviewed one by one:** Kitchen, food detail, auth, health, household, intake/receipt, quick add, settings. They inherit the palette, type and components, and the ones opened looked right, but each still needs a visual pass.
- **Not covered:** Android, physical devices and VoiceOver.
