# Phase 11: operations runbooks

## API unavailable

1. Check `GET /health/live` and `GET /health/ready` separately.
2. If liveness fails, inspect the API process and recent structured logs.
3. If readiness fails, check PostgreSQL reachability, connection limits, and migrations before restarting the API.
4. Restart one API instance and verify both routes plus a read-only GraphQL query.

## Worker backlog

1. Inspect pending, processing, failed, and dead-lettered counts for the affected queue.
2. Check oldest-job age, worker logs, provider health, and database locks before replaying anything.
3. Restart a single worker after recording the stuck job IDs. Claim routines use leases and `SKIP LOCKED`; verify a retry does not duplicate the domain event.
4. Do not reset attempts or delete queue rows to make the backlog appear healthy.

## PostgreSQL backup and restore drill

Run `pnpm phase11:backup-restore` with a dedicated `DATABASE_URL_TEST`. The script refuses to use the application database, writes the temporary custom-format backup under the operating system temp directory, restores into a random new database, checks the migration ledger, then drops only that generated database and deletes the temporary backup.

For an operational backup, use a managed PostgreSQL backup/PITR service for production. Keep credentials in a secret store, encrypt backups at rest, restrict access, and record retention and restore-point objectives. The local drill validates logical backup/restore; it does not establish PITR or off-site durability.

## Graceful shutdown / worker interruption

Stop one API process with the normal service manager signal. Confirm in-flight requests finish and worker shutdown waits for its current pass. If a process is killed during delivery, confirm its lease becomes retryable after five minutes and the provider operation is idempotent or deduped. Record job IDs and attempts before retrying.

## Hot-path load baseline

Use `pnpm phase11:load` against a dedicated environment with `PHASE11_ACCESS_TOKEN`, `PHASE11_HOUSEHOLD_ID`, and optionally `PHASE11_API_URL`, `PHASE11_REQUESTS`, and `PHASE11_CONCURRENCY`. The script only issues reads for inventory, safe recommendations, and semantic search. Run the same request count and concurrency before and after a change; save output with the dataset size and embedding provider state. Do not run against production or a shared database without an agreed load window.
