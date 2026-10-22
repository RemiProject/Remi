# Phase 11: SLOs and baseline

These are initial service targets for a single local API instance. They are proposals until the team confirms production traffic and monitoring. No latency or availability baseline has been measured yet.

| Indicator | Initial target | Measurement needed |
|---|---:|---|
| API availability | 99.5% monthly | Synthetic `/health/ready` probe from outside the API process |
| Hot GraphQL read latency | p95 < 500 ms | Operation-level duration histogram for inventory, recommendations, and search |
| Inventory write latency | p95 < 750 ms | Duration histogram for `consumeStock` and `addStock` |
| GraphQL server error rate | < 1% over 5 minutes | Operation totals and server-error counters |
| Oldest ready worker job | < 5 minutes | Queue age and status counts per worker |
| Database pool saturation | < 80% of configured pool | Active / idle Prisma pool measurements |
| Backup recovery point | ≤ 24 hours | Scheduled PostgreSQL backup plus retained backup age |
| Restore time | ≤ 60 minutes for the graduation dataset | Timed restore drill and post-restore checks |

## Current baseline

- `/health/live` and `/health/ready` exist. The ready route checks PostgreSQL reachability.
- Structured request logs and GraphQL operation counters, server-error counters, duration histograms, process uptime, and resident memory gauges are implemented. The Prometheus-compatible `/health/metrics` endpoint is hidden unless `METRICS_ENABLED=true` and a `METRICS_TOKEN` of at least 32 characters is configured.
- The local environment has not enabled the scrape endpoint yet. Worker queue age and Prisma pool utilization metrics are not instrumented.
- `GRAPHQL_DEPTH_LIMIT` is active. A query complexity budget is now also enabled; list arguments are capped in its estimate. Set `GRAPHQL_INTROSPECTION=false` for production.
- `pg_stat_statements` is installed and preloaded locally. On 2026-10-22, the first cumulative snapshot reported 44 tracked entries. The measurement credential saw `search_document_claim` at 1,535 calls / 0.61 ms mean and `notification_expiry_generate` at 56 calls / 6.63 ms mean. These are early local counters, not a representative load baseline; reset or timestamp the stats and record a defined workload before comparing changes.
- An isolated read-only smoke load ran on 2026-10-22 against a temporary user/household in the dedicated test database with the local embedding endpoint: 30 requests, concurrency 3, 10 requests per operation, 608 ms total, zero errors. Observed p50/p95/p99 were inventory 14/199/199 ms, recommendations 19/164/164 ms, and search 65/251/251 ms. The household had no inventory or recommendation fixtures, so this validates the API paths and provides only a sparse-dataset smoke baseline; it does not establish production capacity or availability.
- A backup/restore drill against the isolated test database passed: all 26 recorded migrations were present after restore.
- The local API now uses a non-superuser runtime role; `pnpm phase11:rls-audit` passes for scoped tables, including recommendation isolation. Identity/session/membership/outbox table policy review remains open; see `RLS_AUDIT.md`.
- `pnpm phase11:load` runs a configurable, read-only inventory/recommendation/search mix and prints p50/p95/p99. It requires a short-lived access token and active household ID in `PHASE11_ACCESS_TOKEN` and `PHASE11_HOUSEHOLD_ID`; keep both in environment variables, and use a dedicated test environment for load runs.

## Before/after rule

Record the dataset size, request mix, concurrency, duration, and p50/p95/p99 for each benchmark. Keep the same load profile when comparing a change. Do not add indexes, PgBouncer, or replicas until a measured query or connection limit justifies them.

Run `pnpm phase11:query-baseline` with `DATABASE_URL_METRICS` set to a trusted measurement role. The script falls back to `DATABASE_URL_MIGRATOR` for a one-off read-only snapshot, then to `DATABASE_URL`; do not use the migration credential for API traffic. The limited runtime role cannot read `shared_preload_libraries` or all statement statistics, by design.
