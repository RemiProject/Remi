# AI Kitchen Intelligence Platform

Monorepo for the AI Kitchen graduation project.

## Repository structure

- `backend/` — NestJS GraphQL API, CQRS application modules, Prisma query client, and PostgreSQL migrations.
- `frontend/` — placeholder for the web application team.
- `mobile-app/` — placeholder for the mobile application team.

## Backend status

The backend implements the platform foundations and core flows for identity, catalog, inventory, recipes and meals, nutrition, shopping and purchasing, personal safety profiles, deterministic predictions, safety-gated recommendations, semantic search with pgvector, and notifications.

Phases 0–10 core implementation is in place. Phase 11 adds hardening and operations work; the backend README lists remaining production-readiness items. The API is available for frontend and mobile integration. Production launch still requires completion of the operational checks and loading reviewed catalog and nutrition data.

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

## Documentation

- Backend setup, scripts, phase status, and handoff notes: [backend/README.md](backend/README.md)
- GraphQL operations and payload examples: [backend/GRAPHQL_ENDPOINTS.md](backend/GRAPHQL_ENDPOINTS.md)
- Architecture and database migrations: [backend/prisma/migrations](backend/prisma/migrations)

Starter catalog records are for development. Nutrition values need a trusted, reviewed data source before production use.
