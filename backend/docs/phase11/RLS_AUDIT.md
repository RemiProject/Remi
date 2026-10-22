# Phase 11: RLS audit findings

The read-only audit command is `pnpm phase11:rls-audit`. It prints catalog metadata and returns exit code 2 when it finds an elevated application role or an unprotected tenant table.

## Current local result

Migrations `0024_runtime_role_and_recommendation_rls.sql`, `0025_phase11_recommendation_trigger_fix.sql`, and `0026_runtime_catalog_readonly.sql` are applied to the local application and test databases. The API connects through a dedicated non-superuser login that inherits the non-login `kitchen_runtime` group. The prior administrative connection is retained as `DATABASE_URL_MIGRATOR` in the ignored local `.env`; never use that URL for the API.

The current `pnpm phase11:rls-audit` result passes: the runtime role has `rolsuper=false`, `rolbypassrls=false`, and all scoped tables have policies. The test harness also created two household members and confirmed one member cannot read the other's recommendation, shopping item, or safety-check row. A smoke API process using the limited role returned readiness `200` and a GraphQL reference-data response `200`.

The runtime group retains ordinary `SELECT`/`INSERT`/`UPDATE`/`DELETE` and sequence privileges for API/worker flows, but global catalog/reference tables are read-only to it, and it has no access to `_migrations`. Default table privileges for future tables were removed; migrations must explicitly grant only the privileges required by the runtime. The group does not own tables and has no schema/role-management privileges. RLS scopes the tables listed in the audit script. Three recommendation tables have household-and-user policies. Their policies are enabled but not forced: the runtime role is not the table owner, and the SECURITY DEFINER safety/worker functions rely on their owner context. Keep the runtime login out of table ownership and do not grant it `BYPASSRLS`.

Identity/session, membership, and outbox tables still do not have RLS policies. They remain an explicit follow-up for a separate access-path review; this audit's PASS covers the tables in `scopedTables`, not every row in the schema. The local PostgreSQL instance has `pg_stat_statements` installed and preloaded. The limited runtime role cannot inspect `shared_preload_libraries` or global statement statistics; use `DATABASE_URL_METRICS` for measurement, or the read-only baseline command's one-off `DATABASE_URL_MIGRATOR` fallback.

## Initial local findings (historical)

The audit against the configured application database reported:

- Connection role `postgres` had both `rolsuper=true` and `rolbypassrls=true`. PostgreSQL superusers bypass RLS, so policies could not protect requests made by that API connection.
- `AIRecommendation`, `AIShoppingRecommendation`, and `AIRecommendationSafetyCheck` have no RLS policies.
- `Notification`, `NotificationDelivery`, `NotificationPreference`, `UserDevice`, and `SearchDocument` have RLS policies but do not use `FORCE ROW LEVEL SECURITY`; table owners can bypass them. The current superuser bypasses them regardless.
- User, household, membership, session, token, and outbox tables currently have no RLS. Their access paths need an explicit auth/worker review before enabling policies because login and global worker flows require cross-user lookup.
- The current PostgreSQL instance has no `pg_stat_statements` extension and no shared preload configuration.

## Remaining remediation order

### Access-path review (completed; policy implementation remains gated)

| Table family | Current access path | Why blanket tenant RLS would break it | Safe next design |
|---|---|---|---|
| `User` | Login and registration find users by normalized email; auth also loads a user by JWT subject. | Before login there is no trusted `app.user_id`; setting it from an email/token lookup would turn the policy into a self-asserted identity check. | Narrow database functions for login lookup and subject lookup, or establish a separately trusted auth role/interface before adding policies. |
| `Token`, `HouseholdInvitation` | Email verification/password reset and invitation acceptance locate rows by hashed opaque token; invitation acceptance joins the target household and membership. | These unauthenticated flows must find a single row by secret token, while household administration needs current membership checks. A user-scoped policy applied directly would hide valid tokens or make cross-household checks unsafe. | SECURITY DEFINER functions keyed by token hash, with fixed `search_path`, minimal returned fields, strict one-row behavior, and explicit expiry/used/revoked checks. |
| `Session` | Refresh rotates a session by refresh-token hash; logout uses the same credential; logout-all revokes sessions by authenticated user. | Refresh-token lookup happens before an access-token user context exists. Logout-all is intentionally multi-row for one authenticated user. | Narrow refresh-hash lookup/rotate/revoke functions; keep logout-all bound to the verified JWT subject. Test replay and concurrent rotation before enabling RLS. |
| `HouseholdMember`, `Household` | Membership is read for request authorization, household switching, invitation acceptance, and cross-row trigger checks. | Policies that require an already verified membership can recurse or prevent the initial authorization lookup; invitation acceptance changes membership as part of a cross-table transaction. | Define and test a single trusted membership-check function and explicit write flows; preserve trigger owner context and validate revoked/left memberships. |
| `OutboxEvent` | Domain transactions publish tenant and global identity events; one poller claims and processes pending rows across households. | A tenant policy would hide jobs from the global poller and could strand jobs without a household, while user requests should not read or mutate queue rows. | Revoke direct runtime access and move claim/complete/fail into narrowly scoped worker functions. Keep publisher writes behind a separate transaction interface and test all event topics. |

This review identifies the required boundaries but does not add policies to these tables. Adding policies before implementing and testing those interfaces risks blocking login, refresh, invitation acceptance, or worker delivery. Keep the API role non-owner and do not use the migration credential for runtime traffic.

### Remaining closure gates

1. Implement the narrow auth, membership, and outbox interfaces above, then add policies in an additive migration and prove login, refresh rotation, logout-all, invitation, and worker flows against an isolated database.
2. Expand integration assertions to cross-household access and the full set of protected tables.
3. Evaluate `FORCE ROW LEVEL SECURITY` table by table after reviewing trigger and SECURITY DEFINER ownership. The runtime role is already a non-owner, so enabled policies apply to it.
4. Enable `pg_stat_statements` in PostgreSQL configuration and restart the local server during a planned window; run the query baseline with a trusted measurement role.
5. Run `pnpm phase11:load` against a dedicated test environment with a short-lived access token and active household ID. Those inputs are not configured in this workspace.
6. Keep migration credentials separate in every deployed environment and provision the runtime role through the secret manager rather than committing connection strings.

Do not treat the current API as production-ready for full tenant isolation until identity/session/membership/outbox access paths have been reviewed and the cross-household integration assertions have been added.
