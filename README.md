# Remi: Version 3

Remi is a cooking and kitchen app: recipes, a planner, a shopping list and the food in your kitchen. Version 3, "Sip happy", is on the `version-3` branch.
- **[VERSION-3.md](VERSION-3.md):** each element of the release, with its commit.
- **[docs/](docs/README.md):** the index of all documentation.

What version 3 added, beyond the redesign:
- **Food photography:** every catalogue recipe (400) and ingredient (800) has a photo.
- **Recipe nutrition:** values per serving from USDA data, with labels, filters, planner totals and Health "Today". See [docs/nutrition.md](docs/nutrition.md).
- **Receipt scanning:** a receipt photo is read line by line and matched to the catalogue. Bags, fees and household goods are left out, and the confirmed foods go into the kitchen in one step. See [docs/receipt-scanning.md](docs/receipt-scanning.md).
- **Probable expiry dates:** fresh produce gets a purchase day and an expiry estimate from USDA FoodKeeper averages. See [docs/shelf-life.md](docs/shelf-life.md).
- **Saving recipes from links:** paste a recipe link and Remi structures it under My recipes. See [docs/recipe-import.md](docs/recipe-import.md).
- **Publishing:** account deletion, privacy policy and terms, push reminders, offline reading and the remaining account steps for the App Store are in [docs/release.md](docs/release.md).
- **Phone testing:** iPhone install, a stress test and the fixes it led to are in [docs/phone-testing.md](docs/phone-testing.md). Creating an account is in [docs/account-setup/](docs/account-setup/README.md).

Current state on the development database:
- **Catalogue:** 851 foods with 2,074 English and Arabic aliases, 400 recipes, 79 packaged products, 707 foods with nutrition, and 130 fresh foods with shelf-life data.
- **Checks:** 157 backend tests and 441 app tests pass, and typecheck and lint are clean.

The Version 2 Living Cookbook redesign is described in [VERSION-2.md](VERSION-2.md).

# AI Kitchen Intelligence Platform

Monorepo for the AI Kitchen graduation project.

## Repository structure

- `backend/` — NestJS GraphQL API, CQRS application modules, Prisma query client, and PostgreSQL migrations.
- `frontend/` — placeholder for the web application team.
- `mobile-app/` — Expo / React Native app for iOS, Android and web.

## Backend status

Phases 0–10 core flows are implemented. Phase 11 hardening is underway. The API is available for frontend and mobile integration, and the latest local checks passed: lint, type-check, 157 unit tests, production build, database schema validation, and the documented Phase 5, 6, 7, 10, safety-category, RLS, query-baseline, and backup-restore checks.

The local catalog has 851 foods, 400 recipes, 707 nutrition profiles from USDA FoodData Central, and 130 shelf-life entries from USDA FoodKeeper. All are loaded with `pnpm data:import`. Allergen tags and recipe data still need expert review before production use. Production launch also requires load and soak testing, point-in-time recovery validation, final access review, and environment-backed verification of email and object storage.

## Run the backend locally

Requirements: Node.js, pnpm, Docker with Docker Compose, and PostgreSQL support from the provided Compose setup.

```bash
cd backend
cp .env.example .env
# Set local secrets in .env; do not commit this file.
pnpm install
pnpm docker:infra
pnpm migrate
pnpm seed
pnpm seed:catalog
pnpm data:import       # foods, nutrition, products, recipes, shelf life (backend/data/)
pnpm db:generate
pnpm start:dev
```

To run the app on an iPhone against this API, see [docs/phone-testing.md](docs/phone-testing.md).

The GraphQL endpoint is `http://localhost:3000/graphql`. Configure local database credentials and JWT secrets in `backend/.env` before starting the API.

## Data entry

CSV templates and all-or-nothing import instructions are in [backend/data/README.md](backend/data/README.md). Nutrition and shelf-life values must come from a reviewed, trusted source with its ID recorded. They come from USDA FoodData Central and USDA FoodKeeper, and are never estimated by hand.

## Documentation

- All documentation, by topic: [docs/README.md](docs/README.md)
- Backend setup, scripts, phase status, and handoff notes: [backend/README.md](backend/README.md)
- GraphQL operations and payload examples: [backend/GRAPHQL_ENDPOINTS.md](backend/GRAPHQL_ENDPOINTS.md)
- Architecture and database migrations: [backend/prisma/migrations](backend/prisma/migrations)
