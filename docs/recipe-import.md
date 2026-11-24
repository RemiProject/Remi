# Saving recipes from a link ("My recipes")

Paste a recipe link, or share a page to Remi from Safari, Chrome or any app. Remi reads the recipe, matches the
ingredients to its food list, and saves it to **My recipes** for the whole household.

## How it reads a page

Recipe sites publish their recipes as schema.org `Recipe` data (JSON-LD) for search engines. Remi reads only that:
the name, description, servings, times, photo, author, site, ingredient lines and steps. Steps can be plain strings,
`HowToStep` objects or `HowToSection` groups, and the recipe can sit inside an `@graph`. A page without this data gives
"No recipe was found on that page" rather than a guess. Many video posts and some Arabic sites (mawdoo3, webteb)
don't publish it, so they can't be read.

Each ingredient line is split into amount, unit and food (`backend/src/modules/recipes/domain/recipe-page.ts`):
- **Amounts:** "1 1/2", "1½", "3/4", "2-3" (the first number) and Arabic-Indic digits.
- **Units:** cups, tbsp, tsp, g, kg, ml, l, oz → g, lb → g, and pieces (cloves, cans, eggs), plus the Arabic unit words.
- **Clean-up:** "to taste" and "(optional)" mark a line optional, and preparation words ("chopped", "fresh") are removed before matching.

The food part is matched with the same catalogue matcher as receipt scanning.

## What is saved

- **Every line exactly as the page printed it** (`RecipeIngredientLine`, migration 0033), so nothing from the original is lost.
- **Linked lines:** each line the person leaves ticked, with a confident food and an amount, also becomes a normal recipe ingredient. Those count for nutrition, kitchen matching and shopping. The same food twice in the same unit is added together.
- **Source:** the page's link, site name and photo. The recipe page shows the photo and an "Open the original" link.
- **Duplicates:** saving the same link again warns that it's already saved and offers to open it.

## Safety

The server fetches the page (`infrastructure/safe-fetch.ts`) under these limits:
- only http(s) on the standard ports;
- never a private, local or cloud-metadata address, checked again after every redirect;
- at most 4 redirects, a 10 s timeout and a 3 MB cap;
- `previewRecipeImport` is throttled to 10 calls a minute.

A host that changes its DNS answer between the check and the request is a known remaining gap, marked in the code.

## API

- **`previewRecipeImport(url)`:** reads the page and returns the recipe and the ingredient matches, without saving anything.
- **`saveImportedRecipe(input)`:** saves the reviewed recipe for the household.
- **`myRecipes`:** the household's own recipes, newest first.
- **`archiveRecipe(id)`:** removes a recipe from My recipes. Catalogue recipes can't be removed.

## App

- **Share sheet:** `expo-sharing`'s share extension, configured in `app.json`, accepts web links and text. `src/app/+native-intent.ts` sends shares to `/import-recipe`.
  - **Phone builds:** the extension needs the App Group `group.com.remi.cookbook.independent` registered on the Apple team. Until it is, phone builds are made with the extension turned off: `REMI_NO_SHARE_EXTENSION=1 npx expo prebuild --platform ios --clean`, then `pod install` (see `app.config.ts`). Pasting a link still works.
  - **Turning it on:** in Xcode, open Remi → Signing & Capabilities, add App Groups, and add that group. Then prebuild again without the variable.
- **Import screen (`/import-recipe`):** paste, or receive a shared page. Review the name, servings and which ingredients link to Remi's food list, then save.
- **Where it appears:** a "My recipes" tab in the cookbook once one exists, plus "Save a recipe from a link" in the cookbook and in Quick add (the pink + button).

## Checks

- **Backend tests** (`test/unit/recipe-page.spec.ts`, `safe-fetch.spec.ts`): JSON-LD shapes, durations, yields, English and Arabic ingredient lines, and the fetch guard.
- **App tests:** `scripts/test-recipe-import.cjs`.
- **Live sites:**
  - The Mediterranean Dish koshari: read in about 0.8 s, with 17 of 20 ingredients linked.
  - Urban Farmie koshari: 34 of 38 ingredients linked.
  - The koshari was saved on the simulator, shown under My recipes, and opened.
  - Saving the same link again was detected.
  - Removing it worked.
