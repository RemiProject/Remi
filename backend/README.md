# AI Kitchen API — Phases 0–11 (NestJS 12 · CQRS · Prisma 7 · PostgreSQL 18)

Implements the platform and identity foundations, the catalog and unit conversion foundation, and the first inventory ledger path from `AI_Kitchen_ERD_Architecture_Guide.html`.

## Project status and handoff

Phases 0–10 core flows are implemented. Phase 11 operational hardening is underway, with the completed checks and remaining production tasks summarized below. The GraphQL API is available for frontend and mobile integration. Production launch still requires operational review and verified catalog and nutrition data.

The monorepo is organized as `backend/`, `frontend/`, and `mobile-app/`. The latter two folders are placeholders for the teams building those clients. The backend API contract and example operations are documented in `GRAPHQL_ENDPOINTS.md`.

Catalog seed data is starter data. Nutrition values are intentionally not populated until a trusted source is selected and reviewed. Do not treat the starter catalog as complete production data.

## Seed an existing account's Kitchen (development only)

With the local backend running and the catalog seeded, run from `backend/` on Windows:

```powershell
node scripts/seed-my-kitchen.mjs
```

Enter your existing account's email and password at the hidden prompts. The account
must have verified its email. The script never logs or saves credentials/tokens.
For noninteractive use, supply `KITCHEN_SEED_EMAIL` and `KITCHEN_SEED_PASSWORD`
through your environment; avoid typing passwords into shell history.
`API_URL` optionally overrides `http://localhost:3000/graphql`; only loopback hosts
are allowed, and the script refuses `NODE_ENV=production`.

It reuses an existing household, or creates **My Kitchen** in the device timezone
only if there are no memberships. With several memberships, it uses its last-used
selection if valid, otherwise the first. Only the selected household ID is saved
in a per-account/per-backend temp file outside the repo. Browser storage cannot be
read by this script: if Expo already uses another household, set
`$env:KITCHEN_SEED_HOUSEHOLD_ID="<household-id>"` to target that membership.

It adds five catalog foods with varied units, storage locations and expiry dates,
including one expiring at the end of today in the household timezone. Every run
adds more stock; it does not erase or reset any existing inventory. Run just once
for a manual preview. It starts no server and changes no `.env` file.

## Package manager

The backend uses pnpm only, with `pnpm@10.0.0` pinned in `package.json` and
`pnpm-lock.yaml` as its sole dependency lockfile. Run backend commands from
`backend/`. The Bash examples below use `pnpm`; on Windows, use `pnpm.cmd`
instead because PowerShell's script policy can block the `pnpm.ps1` shim.
For example, use `pnpm.cmd run typecheck`, `pnpm.cmd run lint`, and
`pnpm.cmd test` on Windows. Install reproducibly with
`pnpm.cmd install --frozen-lockfile` (or `pnpm install --frozen-lockfile` in Bash).

## Run — option 1: app on your machine, infrastructure in Docker (best for development)
```bash
cp .env.example .env              # set POSTGRES_PASSWORD, DATABASE_URL (same password), JWT secrets (>= 32 chars)
pnpm install
pnpm docker:infra                 # starts db + s3 + mailpit
pnpm migrate && pnpm seed         # SQL migrations + reference seed (both safe to re-run)
pnpm seed:catalog                 # starter catalog (safe to re-run; nutrient values need a trusted source)
pnpm db:generate                  # prisma generate -> src/generated (needs internet for the engines)
pnpm start:dev                    # http://localhost:3000/graphql
```
Mailpit (every email the app sends): http://localhost:8025 · S3 (SeaweedFS): http://localhost:8333 · Postgres: `127.0.0.1:5432`.

## Run — option 2: everything in Docker (db + s3 + mailpit + migrate + api)
```bash
cp .env.example .env              # same as above
pnpm docker:up                    # builds the api image, runs migrations (one-shot `migrate` service), starts the api
pnpm seed                         # reference data; run from the host (the Postgres port is published on 127.0.0.1)
pnpm docker:logs                  # follow all logs   |   pnpm docker:api:logs  for the api only
```
Start order is enforced by compose: `db` healthy → `migrate` finishes → `api` starts. The api runs read-only, as non-root, with a 512 MB limit.
Inside containers the api talks to `db:5432`, `s3:8333` and `mailpit:1025` (compose overrides those env vars); your `.env` keeps the `localhost` values for running the app on the host.

## Docker scripts (package.json)
Everything uses `docker compose --profile app`, so the same commands work for infra-only and full-stack.

| Goal | Command |
|---|---|
| Start only infra (db, s3, mailpit) | `pnpm docker:infra` |
| Build + start everything (incl. api) | `pnpm docker:up` |
| Stop all (keeps containers and data) | `pnpm docker:stop` |
| Start stopped containers again | `pnpm docker:start` |
| Restart all | `pnpm docker:restart` |
| Remove containers + network (**keeps data volumes**) | `pnpm docker:down` |
| Remove containers **and volumes = DELETES DB and S3 data** | `pnpm docker:clean` |
| Status | `pnpm docker:ps` |
| Follow logs of everything | `pnpm docker:logs` |
| Rebuild the api image | `pnpm docker:build` |
| Run migrations inside Docker | `pnpm docker:migrate` |

Per service — `<svc>` is one of `db`, `s3`, `mailpit`, `api`:

| Action | Command |
|---|---|
| Start (api is rebuilt) | `pnpm docker:<svc>:up` |
| Stop | `pnpm docker:<svc>:stop` |
| Restart | `pnpm docker:<svc>:restart` |
| Follow logs | `pnpm docker:<svc>:logs` |
| Delete the container (volume data is kept) | `pnpm docker:<svc>:rm` |

Example: `pnpm docker:db:restart`, `pnpm docker:api:logs`, `pnpm docker:mailpit:rm`.

## Database / Prisma scripts
SQL files in `prisma/migrations` are the source of truth; Prisma is only the query client.

| Goal | Command |
|---|---|
| Apply SQL migrations (checksummed, in order) | `pnpm migrate` |
| Load reference data (idempotent) | `pnpm seed` |
| Generate the Prisma client into `src/generated` | `pnpm db:generate` |
| Refresh `schema.prisma` from the real DB after a migration | `pnpm db:pull` then `pnpm db:generate` |
| Validate / format the schema | `pnpm db:validate` · `pnpm db:format` |
| Browse data in the browser | `pnpm db:studio` |
| Open `psql` inside the db container | `pnpm db:psql` |
| **Wipe the schema**, re-migrate and re-seed (dev only!) | `pnpm db:reset` |

## Quality scripts
| Goal | Command |
|---|---|
| Lint | `pnpm lint` · auto-fix: `pnpm lint:fix` |
| Type-check | `pnpm typecheck` |
| Unit tests | `pnpm test` · watch: `pnpm test:watch` |
| Production build (prisma generate + nest build + alias rewrite) | `pnpm build` then `pnpm start` |

### ESLint rules worth knowing
* Imports must use the `@/` alias (`@/platform/...`), never `../`.
* `domain/` is pure TypeScript: no Nest runtime, Prisma, AWS, SMTP, and no outer layers (type-only imports are allowed).
* `application/` never imports Prisma/AWS/SMTP/GraphQL or `infrastructure/`/`presentation/`.
* `presentation/` (resolvers) never imports repositories or Prisma; it only uses `CommandBus`/`QueryBus`.
* A module never imports another module's `infrastructure/`, `domain/` or `presentation/`.

## CQRS layout (per module)
```
modules/<name>/
  domain/        entities · events · ports (repositories/adapters) · pure rules · errors
  application/
    commands/<use-case>/  x.command.ts + x.handler.ts   (writes: TX + outbox, then EventBus.publish)
    queries/<use-case>/   x.query.ts   + x.handler.ts   (reads only, no TX)
    *.events-handler.ts                                 (in-process reactions to domain events)
  infrastructure/ prisma repositories · adapters (argon2, jwt) · outbox handlers (emails)
  presentation/   resolvers (only CommandBus/QueryBus) · inputs (class-validator) · GraphQL types
```
* Command = intent that changes state. Query = read. Event = something happened (published AFTER commit).
* Guaranteed side effects (emails) go through the **outbox** (same TX as the write), not through events.
* Cross-module calls go through the buses (`ResolveRegistrationReferencesQuery`, `GetActiveMembershipQuery`), never by importing another module's repositories.

### Add a feature
1. `application/commands/my-thing/my-thing.command.ts` (`extends Command<Result>`) and `.handler.ts` (`@CommandHandler`).
2. Register the handler in the module's `providers`.
3. Add a resolver method that does `commandBus.execute(new MyThingCommand(...))`.
4. Extra reaction? Add an `@EventsHandler` (best effort) or an outbox topic + `@OutboxHandler(topic)` (guaranteed).

## Phase 0 (platform)
config (zod) · db (Prisma adapter-pg, `TransactionRunner` with 40001/40P01 retry + `app.user_id/app.household_id`) · outbox (publisher, poller with SKIP LOCKED + lease + backoff + dead letter, `@OutboxHandler`) · tenancy (JWT, household guard, roles) · graphql (scalars, depth limit, error mapper, throttler) · mail (handlebars ar/en) · storage (S3 presign) · health · Docker.

## Phase 1 (identity)
Tables: Country, Language, Locale, Cuisine, FoodCategory, User, Household, HouseholdMember, HouseholdInvitation, Token, Session.
Commands: register, login, refreshAccessToken, verifyEmail, requestPasswordReset, resetPassword, createHousehold, inviteMember, acceptInvitation, revokeInvitation, removeMember, leaveHousehold.
Queries: me, myHouseholds, householdMembers, householdInvitations, countries/languages/locales/cuisines/foodCategories.

Household-scoped operations need headers `Authorization: Bearer <access>` and `x-household-id: <uuid>`.

## Phase 2 (catalog)
Tables: Currency, Food, FoodAlias, NutritionProfile, FoodSubstitution, Product, ProductSource. The `foods(search, first, after)` query searches canonical names and localized aliases with an ID cursor. `UnitConverter` uses exact decimal arithmetic, the versioned cup/tablespoon constants, and half-up rounding to three decimal places. `pnpm seed:catalog` loads a starter list; nutrition values are intentionally left empty until a trusted source is selected.

## Phase 3 (inventory ledger)
Migrations `0006_inventory.sql` and `0007_inventory_integrity.sql` add inventory batches, causal food events, and append-only transactions with household keys, RLS policies, deferred event-to-ledger checks, food/item consistency, and database guards for quantity edits. The authenticated household API provides paged `inventory`, `inventoryItem` with paged transaction history, `addStock`, FEFO-ordered `consumeStock`, and `adjustStock`. Repeated idempotency keys replay the original result only when the request matches. The service also exposes purchase receipt and discard operations for later workflows. A daily reconciliation checks snapshot quantities against ledger sums, logs discrepancies, and never repairs data automatically. See `GRAPHQL_ENDPOINTS.md`.

## Phase 4 (recipes, meals, and daily nutrition, complete)
Migrations `0008_recipes.sql` and `0009_meals.sql` provide global or household-private recipes, ingredients, ordered steps, meal plans, planned meals, individual and family meal logs, meal-time nutrition snapshots, and per-user daily nutrition summaries. Recipe scope and household membership are enforced by database guards and RLS. Logging a home meal consumes stock through the inventory ledger in the same transaction; a family meal consumes it once, creates a meal per active member, and allocates food quantities exactly across member and guest servings. Guests are not assigned meals or nutrition. Idempotency keys prevent duplicate operations, and daily summaries use each user's timezone. GraphQL provides recipe, meal logging, meal plan, and daily nutrition operations. See `GRAPHQL_ENDPOINTS.md`.

## Phase 5 (shopping and purchasing, complete)
Migration `0010_commerce.sql` adds household-scoped shopping lists and items, purchase orders with currency and price snapshots, generated line totals with a deferred order-total guard, and a purchase-order state guard. GraphQL includes shopping list CRUD, `purchaseOrders`, `createPurchaseOrder`, `transitionPurchaseOrder`, and `receivePurchaseOrderItem`. Receipts go through `InventoryLedgerService` in the same transaction as received-quantity updates, support partial receipts, and use one `PURCHASED` event per order item plus request idempotency keys for retry safety. `pnpm run test:integration:phase5` verifies shopping list CRUD, currency snapshots, partial then full receipt, retry idempotency, and simultaneous duplicate receipt. See `GRAPHQL_ENDPOINTS.md`.

## Phase 6 (personal profile and safety, complete)
Migration `0011_profile_safety.sql` adds personal profiles and weight history, goals, preferences, allergies, health conditions, dietary rules, and append-only safety history. The authenticated self-only GraphQL API exposes `myProfile`, `mySafetyHistory`, `healthConditions`, `updateProfile`, `setGoal`, `addAllergy`, `removeAllergy`, `setHealthConditions`, and `setDietaryPreferences`. A pure `SafetyEvaluator` returns all eight safety filters; allergy and configured `AVOID` rules fail closed, while limits, preferences, and dislikes warn. Statement-level triggers record safety changes and deduplicate the outbox event per user and transaction; RLS restricts personal rows to their owner. Allergy and health notes use AES-256-GCM with row-bound AAD and require `PROFILE_NOTES_KEYRING` to be injected by the runtime secret manager. Configure it as JSON shaped like `{"current":{"kid":"key-2026-01","key":"<base64url-encoded-32-byte-key>"},"previous":[]}`; retain previous keys during rotation. Seeded dietary rules and condition catalog entries are starter reference data; no clinical nutrient thresholds or Halal certification claims are seeded. `pnpm run test:integration:phase6` verifies trigger batching/deduplication, append-only history, encryption, and owner-only RLS. See `GRAPHQL_ENDPOINTS.md`.

## Phase 7 (deterministic analytics and predictions, first end-to-end type)
Migrations `0012_predictions.sql` and `0013_prediction_detail_guard.sql` add nutrition trend storage, image metadata, freshness samples, and the typed prediction base plus `FOOD_DEPLETION` detail. Inventory ledger writes coalesce a household prediction event for five minutes; the outbox worker uses a per-household advisory lock, hashes canonical stock/consumption inputs, converts quantities to each food's default unit, stores one typed prediction per unique input, and expires the previous result when the input changes. `stockForecast(foodId)` and `predictions(type, first, after)` are read-only household GraphQL queries; only `FOOD_DEPLETION` is implemented so far. `FreshnessPolicy` uses the latest image-backed sample above configurable `FRESHNESS_MIN_CONFIDENCE` (default 0.6), returns `NULL` when missing or expired, and updates only the display cache, never inventory quantity/version. A daily maintenance job purges expired prediction rows and refreshes stale freshness scores. `pnpm run test:integration:phase7` covers the end-to-end depletion path, input deduplication/supersede, five-minute scheduling, and freshness cache isolation.

## Phase 8 (safety gated supply recommendations, first end-to-end type)
Migrations `0014_recommendations.sql` through `0016_safety_invalidation_snapshot.sql` add the recommendation base, `SUPPLY_NEED` detail, eight-filter safety verdicts, terminal lifecycle checks, active-member guard, safety profile invalidation, and member rejoin reset. A depletion prediction can create an idempotent per-member draft; the outbox safety worker locks the shared profile, re-reads it, stores all verdicts, and is the only application path that activates a recommendation. The authenticated household GraphQL API exposes only the current user's unexpired `ACTIVE/PASSED` supply recommendations, with accept, dismiss, and debounced regenerate mutations. Feedback folds once into `UserFoodPreference`, and an hourly job expires old rows in bounded batches. See `GRAPHQL_ENDPOINTS.md`.

## Phase 9 (pgvector semantic search)
Migrations `0017_semantic_search.sql` through `0019_embedding_worker_routines.sql` create transactionally maintained documents for foods, recipes, and titled meals, track the embedding model, and provide RLS-safe worker routines. Results are scoped in SQL and backed by RLS; meals are additionally restricted to their owner. Candidates pass through the user's safety profile before display. Configure an OpenAI-compatible endpoint that returns 384 dimensions using `EMBEDDING_API_URL`, `EMBEDDING_MODEL`, and optionally `EMBEDDING_API_KEY`. E5 models receive the required `passage:` / `query:` prefixes; other models receive plain text. Vectors are normalized, provider errors retry with bounded exponential backoff, and health and nutrition fields are excluded. After documents are READY, create the partial HNSW index with `pnpm db:search:index`. The API query is `search(query, types, first)`; details are in `GRAPHQL_ENDPOINTS.md`.

## Phase 10 (notifications and devices)
Migrations `0020_notifications_devices.sql` through `0022_notification_expiry_index.sql` add owner-scoped devices, preferences, inbox records, and a retryable delivery queue. GraphQL supports inbox pagination, unread counts, read marking, device registration/revocation, preference management, and a `graphql-ws` subscription. Expiry alerts are deduped per item and expiry date; safety-passed recommendations also enter the inbox. Delivery uses PostgreSQL `SKIP LOCKED`, timezone-aware quiet hours, and bounded retries. Email is available when SMTP is configured. Push uses FCM HTTP v1 with service-account OAuth credentials (`FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY`); iOS delivery uses Firebase when APNs is configured in the Firebase project. Keep the private key in a local secret store. Missing credentials leave push queued for retry; provider-reported unregistered tokens are revoked. Run `pnpm test:integration:phase10` against a dedicated migrated `DATABASE_URL_TEST` to verify dedupe, disabled preferences, token revocation, and concurrent workers. See `GRAPHQL_ENDPOINTS.md` for operations and payloads.

## Phase 11 (hardening and scale — in progress)

The API enforces GraphQL depth and complexity limits; introspection is disabled unless explicitly enabled. Prometheus-compatible latency and error metrics are available at `/health/metrics` when `METRICS_ENABLED=true` and a 32-character `METRICS_TOKEN` are configured. Operational artifacts are under `docs/phase11`. The runtime database role is a non-superuser.

Verified locally: `pnpm phase11:rls-audit`, `pnpm phase11:query-baseline`, and `pnpm phase11:backup-restore` pass against isolated test databases. Load and soak testing, point-in-time recovery validation, and final access review for identity, sessions, memberships, and outbox data remain open. Docker was unavailable during the latest local check; Mailpit and S3 were not running, so those integrations need environment-backed verification.

For local semantic search development, install the optional Python runtime with `python -m venv .venv` and `.\.venv\Scripts\python.exe -m pip install -r requirements-embeddings.txt`, then run `pnpm embeddings:local`. It serves `intfloat/multilingual-e5-small` on `127.0.0.1:8088`; set `EMBEDDING_API_URL=http://127.0.0.1:8088/v1/embeddings` and `EMBEDDING_MODEL=intfloat/multilingual-e5-small` in `.env`. Model weights are cached under `.local-models` and excluded from Git.

## Notes
* SQL in `prisma/migrations` is the source of truth; `prisma/schema.prisma` mirrors it (refresh with `pnpm db:pull`).
* Latest local verification: `pnpm lint`, `pnpm typecheck`, `pnpm test` (58 tests), `pnpm build`, and `pnpm db:validate` passed. Phase 5, 6, 7, 10, and safety-category integration checks passed on the dedicated test database.
* API verification: `/health/live`, `/health/ready`, and a GraphQL catalog search responded successfully. The local catalog currently has 336 foods and 37 safety-category memberships; nutrition, product, and recipe data still need reviewed data entry.
* Data-entry CSV validation passes in dry-run mode. See `data/README.md` and `data/` for the templates. Nutrition values must come from an approved, trusted source.

