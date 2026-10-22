# AI Kitchen Intelligence Platform

Monorepo for the AI Kitchen graduation project.

## Repository structure

- `backend/` — NestJS GraphQL API, CQRS application modules, Prisma query client, and PostgreSQL migrations.
- `frontend/` — placeholder for the web application team.
- `mobile-app/` — placeholder for the mobile application team.

## Backend status

Phases 0–10 core flows are implemented. Phase 11 hardening is underway. The API is available for frontend and mobile integration, and the latest local checks passed: lint, type-check, 58 unit tests, production build, database schema validation, and the documented Phase 5, 6, 7, 10, safety-category, RLS, query-baseline, and backup-restore checks.

The local catalog has 336 foods and 37 safety-category memberships. Nutrition, product, and recipe data still need reviewed data entry. Production launch also requires load and soak testing, point-in-time recovery validation, final access review, and environment-backed verification of email and object storage.

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
pnpm db:generate
pnpm start:dev
```

The GraphQL endpoint is `http://localhost:3000/graphql`. Configure local database credentials and JWT secrets in `backend/.env` before starting the API.

## Data entry

CSV templates and all-or-nothing import instructions are in [backend/data/README.md](backend/data/README.md). Nutrition values must come from a reviewed, trusted source.

## Documentation

- Backend setup, scripts, phase status, and handoff notes: [backend/README.md](backend/README.md)
- GraphQL operations and payload examples: [backend/GRAPHQL_ENDPOINTS.md](backend/GRAPHQL_ENDPOINTS.md)
- Architecture and database migrations: [backend/prisma/migrations](backend/prisma/migrations)
