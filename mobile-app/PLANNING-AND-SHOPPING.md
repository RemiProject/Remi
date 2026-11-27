# Version 2: first-run onboarding, weekly shopping generation and Home planning cards

These features build on the Version 2 Living Cookbook branch. They connect the
existing pieces, which are the backend recipe catalogue, meal plans, shopping lists
and Kitchen inventory, into one loop:

> pick recipes → plan the week → get a shopping list that leaves out what you already have

## 1. Weekly shopping generation

**Where:** the Shopping list screen has an **Add this week's meals** button. The Home
**Upcoming meals** card has an **Add ingredients to shopping list** button. Onboarding
also runs it when it finishes.

**What it does** (`addPlannedMealsToShopping` in `src/services/plan-shopping.ts`):

1. Loads the household's planned meals for today plus the next 6 days.
2. Loads each planned recipe once, then scales every required ingredient to the meal's
   planned servings (`ingredient quantity × planned servings ÷ recipe servings`).
3. Merges the same food in the same unit across all meals into one line.
4. Subtracts Kitchen stock of the same food and unit, and drops lines that stock fully
   covers.
5. Skips foods already on the active list in the same unit, whether still needed,
   bought or skipped. Pressing the button again never creates duplicates and never
   brings back an item you ticked off. A run interrupted by a network error can be
   repeated safely for the same reason.
6. Adds the remaining lines to the active list, creating "Kitchen shopping" if there is
   none, through the existing `addToShoppingList` mutation.

The calculation is a pure function, `planShoppingLines` in `src/domain/plan-shopping.ts`.
Quantities are handled as exact thousandths (`BigInt`), the same 3-decimal format the
backend `Decimal` uses, so they don't pick up floating-point errors. They are rounded
half up, for example 1 ÷ 3 → `0.333`.

**Rules and limits**

- Optional ingredients and tap water are never added (`isShoppable`).
- Stock in a different unit from the recipe (for example kg in stock, g in the recipe)
  is not converted, so that food is still listed in full. The code marks this as a
  `shortcut:`; convert through the food's density or grams-per-piece if it proves noisy.
- The backend does not merge duplicate items itself, so merging happens on the device
  before anything is written.
- If Kitchen has not loaded, nothing is subtracted and every ingredient is listed.

## 2. Shopping list: by-aisle view

The Shopping list screen has **List | By aisle** chips. By aisle groups the items under
their catalogue food category (Dairy, Grains, Vegetables, …). The categories come from
one aliased `food(id)` query (`loadFoodAisles`), using validated UUIDs only. Items
whose category cannot be loaded appear under **Other**. The list itself keeps working
if that lookup fails.

## 3. Home: Upcoming meals and In your shopping list

- **Upcoming meals** replaces "Today's plan". It shows the next 3 planned meals from
  today, sorted by date and then meal period, as
  "Sweet Couscous · Tomorrow · Dinner · 3 servings". It includes the
  add-ingredients button.
- **In your shopping list** lists upcoming recipes that have required ingredients still
  needed on an active list, as "2 of 3 ingredients on your list". It is hidden when
  there are none. If one recipe fails to load, only that recipe is hidden; Home still
  renders.
- The helpers are `upcomingMeals` and `recipesOnList` in `src/domain/home-plan.ts`.

## 4. First-run onboarding

Shown once per device, the first time a **signed-in** user opens the tabs. Plans and
lists need an account, and signed-out users keep version-2's single sign-in prompt.
If the onboarding flag cannot be read, the app opens normally. The gate is in
`src/app/(tabs)/_layout.tsx`.

| Step | Effect |
|---|---|
| Welcome | — |
| Household size (1–6+) | Servings for every meal planned here |
| Dietary needs (Vegetarian, Vegan, Halal, Gluten-free, Dairy-free) | **Merged** into the profile's backend dietary preferences, never replacing existing ones. Version 2 already uses these for recipe safety filtering |
| Goals (up to 2) | Saved on the device only. Nothing reads them yet |
| Pick recipes (1–7, catalogue, photographed recipes first) | One dinner per day starting today, through `planMeal` |
| Done | "N meals planned", "N items added", plus **See shopping list** and **Go to Home** |

Back, Skip and a 4-step progress bar sit at the top, and the main action is pinned at
the bottom. The flow is in English and Arabic (RTL). Skip saves the answers so far and
opens Home. If a write fails, the screen shows a retry message. Steps already written
(preferences, meals planned so far) are not repeated on retry.

Storage: AsyncStorage key `remy.onboarding` holds
`{ version: 1, completedAt, skipped, answers }`, strictly validated. Corrupt data is
reported and never overwritten. Delete the key to see onboarding again.

`planMeal` (find or create the week plan covering a date, then `planMeal`) was taken
out of the planner screen, so the planner and onboarding share one implementation.

## Files

| Area | Files |
|---|---|
| Generation | `src/domain/plan-shopping.ts`, `src/services/plan-shopping.ts` |
| Shopping UI | `src/screens/connected-shopping-screen.tsx` |
| Home | `src/domain/home-plan.ts`, `src/screens/home-screen.tsx` |
| Onboarding | `src/app/onboarding.tsx`, `src/screens/onboarding-screen.tsx`, `src/domain/onboarding.ts`, `src/repositories/onboarding-store.ts`, `src/providers/onboarding-provider.tsx`, `src/i18n/onboarding.ts`, `src/app/_layout.tsx`, `src/app/(tabs)/_layout.tsx` |
| Planner | `src/screens/connected-planner-screen.tsx` (uses shared `planMeal`) |
| Tests | `scripts/test-plan-shopping.cjs`, `scripts/test-onboarding.cjs`, plus updated `scripts/test-backend-kitchen.cjs` and `scripts/test-kitchen.cjs` |

## Verification

- `tsc --noEmit` and `eslint src` pass. `node --test scripts/test-*.cjs` gives 429 passed
  and 1 skipped; the skipped test is the existing live-backend check.
- New tests cover scaling, merging, unit separation, stock subtraction, duplicate
  skipping, exact rounding, water/optional exclusion, upcoming sorting, list coverage,
  Home rendering (day labels, servings, add button) and onboarding answers, store and
  copy parity.
- A full manual run in Expo web at phone size against a local API (migrated database,
  reference seed, 400-recipe catalogue import) with a fresh account:
  - onboarding planned 2 meals at 3 servings and added 8 scaled ingredients;
  - Halal was saved to the backend profile;
  - a second **Add this week's meals** added nothing;
  - By aisle grouped the items into real categories;
  - Home showed the Upcoming meals and In your shopping list cards.
- Not verified: Arabic layout in the browser, physical iOS/Android devices, and
  recipe photos in onboarding. The optional cookbook seed is restricted to its own
  database, so the local run showed catalogue recipes without photos.
