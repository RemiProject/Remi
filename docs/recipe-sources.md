# Cookbook content and image provenance

Eight practical recipe adaptations are supplied in `backend/data/cookbook-recipes.json`. They use original concise Remi descriptions and instructions informed by the references below. They are not copied source recipes or source-endorsed recipes. Quantities, servings and ingredients were changed; the publishers' nutrition numbers must not be applied to these adaptations.

| Remi recipe | Reference reviewed | Adaptation |
| --- | --- | --- |
| Roasted tomato pasta | [NHS, Perfect pasta and tomato sauce](https://www.nhs.uk/healthier-families/recipes/perfect-pasta-and-tomato-sauce/) | Fresh tomatoes are oven-roasted; two portions with basil. |
| Tomato & spinach shakshuka | [NHS, Egg shakshuka](https://www.nhs.uk/healthier-families/recipes/shakshuka/) | Smaller ingredient list, four eggs and two portions; cook eggs fully. |
| Lemon & red lentil soup | [Nutrition.gov / NIH, Lentil soup](https://www.nutrition.gov/recipes/lentil-soup) | Split red lentils, carrot, cumin, water and lemon; no claim that source nutrition applies. |
| Chickpea & feta salad | [NHS, Greek-style salad](https://www.nhs.uk/healthier-families/recipes/greek-salad/) | Adds cooked chickpeas and parsley; omits olives and oregano. |
| Berry overnight oats | [NHS, Easy overnight oats](https://www.nhs.uk/healthier-families/recipes/easy-overnight-oats/) | Milk and yogurt replace juice/dried fruit; explicit overnight wait. |
| Spinach & potato frittata | [American Academy of Pediatrics / ChopChop, Baked vegetable frittata](https://www.healthychildren.org/English/healthy-living/nutrition/chop-chop-magazine/Pages/Recipe-Baked-Vegetable-Frittata.aspx) | Spinach and potato variation, oven method, thermometer endpoint. |
| Hummus & crunchy vegetable wraps | [NHS, Hummus and salad wrap](https://www.nhs.uk/healthier-families/recipes/hummus-and-salad-wrap/) | Two portions, added cucumber and soft wholemeal flatbread. |
| Egyptian ful medames | [Good Food / Mitshel Ibrahim, Ful medames](https://www.bbcgoodfood.com/recipes/ful-medames) | Ready-cooked beans, less oil and a shorter simmer; no dry-bean cooking shortcut. |

Source pages were retrieved and reviewed during this build on 3 November 2026. The Good Food article was retrievable through its publisher's `tollbit.bbcgoodfood.com/recipes/ful-medames` host. Three guessed NHS paths returned 404 and were not used; the working sources are the links in this table.

## Safety references and limits

- [Health Canada, leftovers](https://www.canada.ca/en/health-canada/services/general-food-safety-tips/food-safety-tips-leftovers.html) supports prompt refrigeration in shallow containers, a two-hour room-temperature limit, a 2–3 day refrigerated leftovers window and reheating to 74°C. It also explains that appearance and smell cannot establish food safety. The app's shared `leftoverSafety` text paraphrases this guidance.
- [Health Canada, safe cooking temperatures](https://www.canada.ca/en/health-canada/services/general-food-safety-tips/safe-internal-cooking-temperatures.html) lists 74°C for egg dishes. This is the frittata endpoint used here.
- [UCLH NHS, G6PD deficiency](https://www.uclh.nhs.uk/patients-and-visitors/patient-information-pages/glucose-6-phosphate-dehydrogenase-g6pd-deficiency) identifies fava beans as a trigger. The ful recipe carries a relevant preparation note.
- Allergen notes name obvious recipe ingredients and known common risks; they are not a guarantee that a packaged ingredient is allergen-free. Users must check labels. Food safety memberships include gluten, dairy, egg and sesame where relevant. Oats are marked conservatively because of possible gluten cross-contact.
- These adaptations have been checked for catalog consistency, positive quantities, plausible preparation, attribution and critical safety instructions. They have **not** been kitchen-tested, dietitian-reviewed or certified suitable for an individual's allergies or medical conditions. Do not present them as clinically validated.
- No nutrition values are inferred or copied from the adapted source recipes. Existing project CSV nutrition and the broader recipe library still need independent review before production recommendations.

## Images

Eight original food illustrations were generated with the built-in Image Generation tool and visually inspected. They share warm natural light, ivory linen, off-white ceramics and a restrained yellow napkin. Each dish has its own image; no outside publisher's photo was downloaded or reused.

The static bundled assets are `mobile-app/assets/cookbook/*.jpg`. Their original generated PNG paths, bundled paths and SHA-256 hashes are recorded in `recipe-image-manifest.json`. JPEG encoding and resizing to 1280 pixels reduce the eight images to about 2.95 MB total. There was no semantic image editing. The originals remain unchanged.

Every recipe metadata record says **AI-generated illustrative image created for Remi. Appearance may differ from your result.** Generated images are not proof of a tested preparation or the user's food. The shakshuka illustration emphasizes tomato and eggs and may not show every spinach leaf; ingredient instructions remain authoritative.

The per-image prompts used the following fixed art direction, with the subject changed per recipe:

> Single culinary editorial photograph; warm natural window light; finely textured ivory linen; butter-yellow napkin at one edge; handmade off-white ceramics; true ingredient colors; close three-quarter overhead angle; dish fills most of frame; no text, logos, people or hands.

Subjects were roasted tomato rigatoni; tomato and pepper shakshuka with cooked eggs; golden lentil and carrot soup; chickpea, cucumber, tomato and feta salad; yogurt berry oats; spinach and potato frittata; hummus and vegetable wraps; and Egyptian cooked fava beans with tomato, lemon and parsley.

## Seeding and verification

Run from the independent backend, after migrations and the reference seed:

```sh
node --env-file=.env scripts/seed-cookbook.mjs --allow-independent-db
node scripts/verify-cookbook.mjs
node --env-file=.env scripts/verify-cookbook.mjs --live
```

The write commands require a database path containing `remi_cookbook`. Deterministic recipe/child IDs and a transaction-scoped advisory lock make repeat seeds converge without duplicating recipes. Only missing required food catalog records are inserted from a selected 30-row slice of the existing canonical food CSV. No user inventory is seeded and no original database is touched.

The live verifier seeds twice, compares recipe IDs and ingredient/step counts, and checks that all ingredient food references exist. The content verifier checks all eight recipes, HTTPS source links, positive exact decimal quantities, supported units and catalog-name resolution. Link syntax checks are not the evidence for source validity; the retrievals and reading recorded above provide that evidence.

Integration metadata is exported by `mobile-app/src/data/cookbook-content.ts`. Match with `getCookbookContent(recipe.name, recipe.id)`, use `image` as the bundled numeric asset source, and show attribution and preparation notes in recipe details. Source metadata must never be silently attached to an unrelated household-created recipe with different content merely because its name matches; restrict that association to the seeded deterministic IDs when integrating user-created recipe support.

## Verification results

- PASS: static content verifier checked all 8 recipes and 30 canonical food records.
- PASS: live verifier on the isolated remi_cookbook DB seeded twice, retained all 8 recipe IDs and exact ingredient/step counts, and found no missing/archived ingredient food references.
- PASS: direct HTTP source checks returned 200 for all 8 recipe URLs; timestamps and final URLs are in `recipe-source-checks.json`.
- PASS: targeted ESLint on `cookbook-content.ts` and `ingredient-images.ts`. A full mobile typecheck passed before the ingredient-helper addition; the parent owns final integrated gates.

## Ingredient artwork

Four additional generated transparent-background PNG cutouts depict tomatoes, spinach, lemon and yogurt. `ingredientImage(name)` in `src/data/ingredient-images.ts` matches their English and Arabic names, returning a static numeric asset ID or undefined for other foods. These are illustrative ingredient categories, not user photographs. Original paths and bundled hashes are in `ingredient-image-manifest.json`.

All four 512×512 PNGs were visually inspected, checked with `sips` for an alpha channel and with ImageMagick for `opaque=False`. Their combined size is about 1.26 MB. They use warm soft light and transparent margins so the parent's paper/color sections show through.
