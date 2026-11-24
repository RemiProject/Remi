# Nutrition in Remi (version 3)

What Mob does with nutrition, what Remi already had, and the work to close the gap. Status marks: ✅ done · ⬜ to do ·
✖ deliberately not done.

## 1. What Mob does

Read from Mob's shipped app binary (Flutter package `octopus`: class names, keys and copy strings). These are the
pieces that make up its nutrition feature:

| Mob piece | Evidence in the binary | What it does |
|---|---|---|
| Recipe nutrition model | `recipe_nutrition_dto`, `nutrition.dart`, `ENERC_KCAL`, `calories`, `protein`, `carbohydrates`, `fat`, `saturatedFat`, `sugars`, `dietaryFibre`, `sodium`, `servingSize` | Nutrients per serving for every recipe |
| Recipe nutrition view | `recipe_detail/widgets/nutrition_view.dart`, `nutrient_box.dart`, `nutrient_item.dart`, `nutritional_information.dart`, `macros`, `otherMacros`, `orderedNutrients`, "Access nutritional info" | A Macros block (calories, protein, carbs, fat as boxes), then the other nutrients as rows |
| Nutrition labels | "High Protein (>30g)", "High Fibre", "Low Calorie", "Low Carb", "High Protein, Low Cal" | Tags and filters on recipes |
| Meal-plan goals | `meal_plan_goal.dart`, `MealPlanGoalsStepView`, `selectGoal`, `goals` | The plan generator asks for a goal (high protein, low calorie) and picks recipes to fit |
| Recipe adaptation | `adapt_recipes`, `CalorieInstructionsView`, `ProteinInstructionsView`, `current_calories_per_serving`, `approx_calories_after`, `calorie_drivers`, "Make it low calorie" | Generated suggestions to cut calories or add protein, with before and after numbers |
| Dietary requirements | `DietarySettingsView`, `DietaryRequirementsSection`, "Any dietary requirements?" | Diet and allergen settings that filter recipes |

## 2. What Remi already had

- **Food nutrition data:** `NutritionProfile` held USDA FoodData Central (SR Legacy) values per 100 g for 676 foods:
  calories, protein, carbs, fat, fibre, sugar and sodium. The source is recorded per row in
  `backend/data/nutrition.csv`.
- **Unit conversion:** the backend converts any recipe unit to grams through density and piece weight
  (`units/domain/unit-converter.ts`).
- **Meal logging:**
  - "Cooked it" and food logging write `MealItem` rows with a nutrition snapshot.
  - A projector sums each user's day into `UserDailyNutrition`.
  - `dailyNutrition(from, to)` serves the daily totals.
- **Goals:** `setGoal` stores a goal type, calorie target and protein target, and `myProfile` returns them.
- **Health screen:** today's totals, goals and measurements, as plain text.
- **Dietary safety:** allergies, health conditions and diet rules already flag unsafe recipes.

**Missing:** recipes had no nutrition, so nothing nutritional showed where people choose what to cook. 124 catalogue
foods had no nutrition data, including staples such as white rice (in 23 recipes), short-grain rice, semolina, red
lentils and couscous. Only 233 of the 400 recipes could be fully costed.

## 3. Plan

### Data
| | Task | Status |
|---|---|---|
| D1 | Add USDA SR Legacy values for the missing foods that have an exact USDA equivalent (rice, semolina, lentils, couscous, coconut milk, spices, herbs, tofu, molokhia = jute leaves, and more). Record each FDC ID, and never estimate | ✅ |
| D2 | Leave foods USDA doesn't cover (baladi bread, Egyptian cheeses, basterma, kunafa dough, pomegranate molasses, date syrup, rose water, and so on) without data, and show that honestly | ✅ |
| D3 | Keep the selection reproducible: `backend/data/nutrition-usda-additions.csv` (food → FDC ID) plus `backend/scripts/usda-nutrition-rows.py`, which reads the official SR Legacy CSVs | ✅ |

### Backend
| | Task | Status |
|---|---|---|
| B1 | `nutrition` on every recipe (list, detail and suggestions): calories, protein, carbs, fat, fibre, sugar and sodium per serving | ✅ |
| B2 | Compute it from the required ingredients through the unit converter, the same maths as meal logging. Optional ingredients are left out | ✅ |
| B3 | Report coverage (`countedIngredients` of `totalIngredients`) so the app can tell a complete figure from a partial one | ✅ |
| B4 | Unit tests for the calculation: units, missing data, per-serving division and optional ingredients | ✅ |

### App
| | Task | Status |
|---|---|---|
| A1 | Recipe page: a **Nutrition per serving** section. Calories lead, then protein, carbs and fat with their share of calories (Mob's Macros), then fibre, sugar and salt. Mob's other-nutrients rows are kept, but saturated fat is dropped because Remi has no data for it | ✅ |
| A2 | Coverage note: "Based on 6 of 7 ingredients", or a complete-data note with the USDA source | ✅ |
| A3 | Compare with your goal: "21% of your 2,000 kcal goal" when a calorie target is set | ✅ |
| A4 | Labels (complete data only): **High protein** ≥ 30 g, **High fibre** ≥ 8 g, **Low calorie** ≤ 400 kcal, **Low carb** ≤ 20 g, all per serving | ✅ |
| A5 | Recipe cards show kcal per serving in the caption | ✅ |
| A6 | Cookbook and Home tabs: **High protein** and **Under 500 kcal** filters | ✅ |
| A7 | Planner: the selected day's planned total (calories, protein, carbs, fat) from each meal's recipe and servings | ✅ |
| A8 | Health screen: "Today" against your targets as progress bars, the other nutrients, and the last 7 days | ✅ |
| A9 | Arabic copy for everything new, plus light and dark checks | ✅ |
| A10 | Tests for labels, filters and planner totals | ✅ |

### Not done, and why
| | Item | Why |
|---|---|---|
| ✖ | Generated "make it low calorie / more protein" rewrites (Mob's Adapt) | It needs a language model and a review loop for food safety. Its before and after numbers would be estimates of estimates. Revisit with the kitchen-helper backend |
| ✖ | Saturated fat | Not in Remi's nutrition data. Adding it means re-extracting all 676 rows; the extraction script can do it later |
| ✖ | Goal-driven meal-plan generator | Remi's planner is manual. The High protein and Under 500 kcal filters give the same choice by hand |

## 4. Results

| | Before | After |
|---|---|---|
| Foods with nutrition data | 676 | 707. Sugar is "not reported" for 26 and fibre for 2, stored as empty rather than 0 |
| Recipes with any nutrition | 0 shown | 400 of 400 |
| Recipes fully costed (every required ingredient) | 233 | 371. Each of the other 29 is missing one local food USDA doesn't cover |
| Required recipe ingredients costed | 3,159 of 3,403 | 3,374 of 3,403 |

**Labels** (complete recipes only):

| Label | Recipes |
|---|---|
| High protein | 96 |
| Under 500 kcal | 272 |
| Low calorie | 212 |
| Low carb | 146 |
| High fibre | 43 |

**Where it shows:**

| Surface | What changed | Screenshot (in `Design/version-3-sip-happy/screenshots/`) |
|---|---|---|
| Recipe page | New Nutrition section | `light-18-recipe-nutrition.png`, `ar-dark-04-recipe-nutrition.png` |
| Cards | kcal in the caption on Home, the cookbook, For you and From my kitchen | — |
| Cookbook and Home | High protein and Under 500 kcal tabs | `light-17-cookbook-high-protein.png` |
| Planner | Day total | `light-20-planner-day-nutrition.png` |
| Health | Today against your goals, and the last 7 days | `light-19-health-today.png` |

**Checks:**
- **Backend:** 150 tests pass, including the new `recipe-nutrition.spec.ts`, and the suggestions test now asserts that nutrition is loaded for the returned page only.
- **App:** 440 tests pass, including the new `test-nutrition.cjs` and the tab and filter cases in `test-recipe-grid.cjs`.
- **Typecheck and lint:** clean.
- **Simulator:** checked in light, dark and Arabic.

**Files:**
- **Backend:**
  - `prisma/migrations/0030_nutrition_unreported_values.sql`
  - `src/modules/recipes/domain/recipe-nutrition.ts`
  - `src/modules/recipes/application/recipe-nutrition.loader.ts`
  - `data/nutrition-usda-additions.csv`
  - `scripts/usda-nutrition-rows.py`
- **App:**
  - `src/domain/nutrition.ts`
  - `src/components/nutrition-panel.tsx`
  - `src/components/nutrition-today.tsx`

## 5. Rules

- **Sources:** every value comes from USDA FoodData Central with its FDC ID. Nothing is guessed (see `backend/data/README.md`).
- **Estimates:** recipe figures are estimates. Raw-ingredient values are summed, so cooking losses, oil absorption and brand differences are not modelled.
- **Partial data:** when ingredients are missing data, the figures are lower bounds, and the app shows no labels for that recipe.
- **Not medical advice:** the app says so next to the numbers.
