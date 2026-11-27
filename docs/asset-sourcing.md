# Food imagery and recipe sources

## Current assets
The app bundles eight curated recipe photos/adaptations and four ingredient cutouts (tomato, spinach, lemon and yogurt). Existing image manifests and recipe source checks retain their credits. The imported 800-food / 400-recipe catalogue does not yet have complete photo coverage.

## Proposed production sources
- **Remi-owned library:** photograph or art-direct consistent cutouts for the most common ingredients, with English/Arabic alt text. Commissioned or generated illustrations can support empty states; they must not invent recipe instructions or nutrition facts.
- **Spoonacular:** evaluate recipe, ingredient and image coverage with a sample of Egyptian/Arabic foods before choosing a paid plan. Retain recipe source links and credits. Subscription, storage and caching permissions need checking against the selected plan; permanent redistribution is not assumed. [API documentation](https://spoonacular.com/food-api/docs), [terms](https://spoonacular.com/food-api/terms).
- **Open Food Facts:** use barcode-matched packaged-product images. Its image license is CC BY-SA and database license is ODbL; preserve attribution and the applicable license obligations. It complements ingredient photography rather than replacing it. [API](https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/), [license guide](https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/tutorials/license-be-on-the-legal-side/).
- **Pexels:** curate editorial photos for discovery and empty states under its license. A generic dish photo must not be presented as an exact photo of a different recipe. [License](https://www.pexels.com/license/).
- **USDA FoodData Central:** a possible ingredient/nutrition reference, not a photo library. [API guide](https://fdc.nal.usda.gov/api-guide/).

TheMealDB is an alternative for a smaller recipe pilot; its test key is for development/education and a public app-store release requires a supporter key. [API terms](https://www.themealdb.com/api.php).

## Delivery
Keep canonical food/recipe IDs separate from provider IDs. Each media record should carry source, license, credits, source URL, English/Arabic alt text and review status. Serve Remi-owned and licensed-to-store assets through our object storage/CDN; respect provider-specific caching rules. Keep paid API keys on the backend. Import and review in batches, create thumbnails, then let the app cache images. Do not call a paid provider or generate images every time the app opens.

Use an intentional illustrated fallback when no approved image matches. Never substitute an unrelated food photo just to fill space. Recipe instructions, nutrition and image rights require separate validation.

This document is a future sourcing plan. No new provider, paid subscription, API key or external image integration is enabled by this update.
