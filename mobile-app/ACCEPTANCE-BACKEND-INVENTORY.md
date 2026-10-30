# Backend inventory acceptance

Backend inventory is the default. Only `EXPO_PUBLIC_BACKEND_INVENTORY=false`
selects the old local UI. See [setup, verification and seeding](README.md).

## Test setup

- Start the existing backend on `http://localhost:3000`, PostgreSQL/pgvector,
  and Mailpit (`http://localhost:8025`); apply migrations and both reference and
  catalog seeds. Do not reset shared development data.
- Start mobile with `pnpm.cmd start`, with no mobile environment overrides, and
  open `http://localhost:8081`. Remove stale ignored flag/API overrides first.
- Use two separate, newly registered and verified test accounts, A and B, each
  with its own household. On web, use separate browser contexts for isolation.
- Use `tomato` for English catalog search and `زيت` for Arabic alias search.
  The canonical carrot/tomato records currently have no Arabic aliases.
- Tests create disposable users, households and batches; they do not delete
  existing device inventory or existing backend data. Verification-script test
  credentials are stored only in its OS temp file, not in this repository.

## Manual checklist

- [ ] **Signed out:** fresh browser → Kitchen shows sign-in explanation/button,
  no household rows, and a separate device-count notice. No local fallback.
- [ ] **Sign in:** verified A can log in and open Kitchen. A with no memberships
  gets exactly one My Kitchen in the device timezone; an existing household is reused.
- [ ] **Empty kitchen:** a new household shows Your kitchen is empty.
- [ ] **Add / English:** search `tomato`, select it, enter `2`, select a supported
  unit/storage and optional expiry day; Save → Added and a new backend batch.
- [ ] **Add / Arabic:** switch language in More → Settings; search `زيت`, select
  its Arabic alias, enter `٠,٧٥`, choose a supported unit, save. No packs, notes,
  photos or automatic catalog creation. No-match keeps the rest of the draft.
- [ ] **Used:** create two batches of the same food/unit with different expiry
  dates. From the later batch, use `0.5`; the earlier batch is consumed first.
  The FEFO hint is visible even with only one batch.
- [ ] **Thrown away:** discard `0.25`; it also applies food-wide FEFO. Check the
  inventory and the displayed batch, not just the mutation's quantity field.
- [ ] **Fix count:** enter a higher and then a lower correct total. The batch is
  refetched before computing the exact delta. Re-enter its unchanged total:
  no adjustment mutation. Zero is a valid correct total.
- [ ] **Added by mistake:** cancel the confirmation once, then confirm. Only that
  batch reaches zero; it disappears from the list and Kitchen shows Updated.
- [ ] **Insufficient stock:** request more than available. You only have X /
  لديك X فقط is visible; the input and quantity are unchanged.
- [ ] **Two users isolated:** B's separate household is empty and cannot list,
  consume, discard or adjust A's stock. Switching accounts never flashes A's rows.
- [ ] **Sign out clears list:** sign out A, return to Kitchen, and check that its
  backend list/detail disappears immediately. The device notice stays separate.
- [ ] **Backend restart keeps data:** run normal verification, restart only the
  backend (keep database/volumes), then run `--check` and log in again on web.
  Quantities and batch IDs must match. A web reload does not retain the session.
- [ ] **Backend down → error + Retry:** while signed in, stop only the API and
  trigger a Kitchen read. Within the 12-second timeout, show a clear error and
  Retry, without a crash, blank page or local fallback. Restart and Retry.
  Also resume an existing session while offline: error + Retry must restore auth
  before loading. A genuinely signed-out user should still see the sign-in state.
- [ ] **Escape hatch:** restart Expo with the exact flag `false`; Kitchen and Add
  use the old local UI without sign-in. Existing local items remain intact.

## Automated evidence for this PR

Results below distinguish component/domain coverage from live API/browser runs.
`PASS (component)` is not a claim of testing an emulator or physical device.
Chrome/Playwright used the real Expo app on port 8081 and the live local backend,
with fresh, Mailpit-verified accounts and UI interactions (not mocked GraphQL).
A separate temporary Expo instance on port 8082 built with the flag `false`
verified the escape hatch; it was stopped after testing. The manual boxes above
remain unchecked for a teammate's independent acceptance pass.

| Item | Result / evidence | Human check still needed |
| --- | --- | --- |
| Signed out / default ON | PASS: real Expo web showed sign-in state with unset-default code; flag and route tests. | Native-device layout. |
| Sign in | PASS Chrome + live API: registered, verified and signed in; API calls used localhost:3000. | Device run. |
| Empty household | PASS Chrome: new household had no rows and showed Your kitchen is empty. Household resolver tests cover create/reuse/concurrency. | Device run. |
| Add EN | PASS Chrome + live API: `tomato` search, 2 PIECE, expiry day, Added banner and persisted batch. | Native keyboard/date entry. |
| Add AR | PASS Chrome + live API: switched through Settings, searched `زيت`, selected Arabic alias, saved `٠,٧٥` L; Arabic confirmation and 0.750 persisted. | Native keyboard/date entry. |
| Used | PASS Chrome + live API: 2.000 → 1.500; component tests also use the real backend FEFO domain allocator. | Native interaction. |
| Thrown away | PASS Chrome + live API: 1.500 → 1.250 with discardStock. Food-wide FEFO is covered by domain/component tests. | Native interaction. |
| Fix count | PASS Chrome + live API: 1.250 → 2.000 → 1.500; unchanged total sent no adjustment. Component tests check fresh reads and exact deltas. | Native interaction. |
| Added by mistake | PASS Chrome + live API: cancel preserved 1.500; confirm set only this batch to 0.000, removed its row and showed Updated on Kitchen. | Native interaction. |
| Insufficient stock | PASS Chrome + live API: amount 99 rejected at balance 1.500, available message shown, input and balance unchanged. | Native presentation. |
| Two users isolated | PASS Chrome: B's separate browser/household remained empty. API verifier `--isolation` passed 8/8, including forbidden stock access; component tests cover stale responses. | Device account switch. |
| Sign out clears list | PASS Chrome: signed out A, returned to Kitchen, saw sign-in state and no previous household rows; component tests cover immediate masking. | Device run. |
| Backend restart persistence | PASS across observed API outage/recovery: the API initially worked, later refused connections, then recovered under the existing watcher. `--check` afterward found the same batch ID at 1.250 PIECE, version 4. No second API was started. | Independently perform a deliberate API-only restart and compare IDs/quantities. |
| Backend down / Retry | PASS Chrome: aborted GraphQL connections, exercised detail error and app-resume Kitchen error, restored connectivity and Retry recovered the list. A failing restoration-error component check was reproduced and fixed. | Deliberately stop/start API during a device run; browser used network simulation, not a commanded shutdown. |
| Flag `false` | PASS Chrome on the separate flag-false build: local empty Kitchen and Add Manually chooser without sign-in. Flag/route tests also pass. | Native local-item comparison. |
| Account verification + sample seed | PASS Mailpit verifyEmail mutation and live `seedMyKitchen` entry point: five foods added to the verified B account. CLI prompting is covered by existing script behavior; no passwords/tokens were committed or printed. | Try interactive hidden prompts in a terminal. |

Validation: mobile typecheck **PASS**, lint **PASS**, all mobile tests **342/342 PASS**,
including the live health/catalog/auth/CORS check with `REMY_TEST_API_URL` set.
The first live-test pass failed while the API was down; the complete suite was
rerun successfully after recovery. Normal API inventory verification passed **9/9**;
household isolation passed **8/8**. The final real-app Playwright run passed **13/13**
checks; the separate flag-false browser check also passed. Browser launchers and
disposable credentials were kept outside the repo; no Playwright dependency was added.

Re-run from the repository root with the existing services running:

```powershell
node backend/scripts/verify-inventory.mjs
node backend/scripts/verify-inventory.mjs --isolation
# Restart the API only, preserving the database, then:
node backend/scripts/verify-inventory.mjs --check
```

From `mobile-app/`:

```powershell
pnpm.cmd typecheck
pnpm.cmd lint
node --test scripts/test-*.cjs
# Optional live health/catalog/auth/CORS check (API base URL):
$env:REMY_TEST_API_URL="http://localhost:3000"
node --test scripts/test-backend.cjs
```

`test-inventory-default.cjs` reproduces the former failure where a network error
during session restoration looked like a normal sign-out. Retry now retries auth
restoration; true logout/expired-session behavior is unchanged.

## Remaining known gaps

- **Email verification has no in-app flow.** Mailpit link tokens must be submitted
  through `verifyEmail`; opening the default localhost:5173 link does not provide
  a working mobile verification route. No six-digit-code flow is available.
- **Editing date/storage/name and true batch delete/archive need backend support.**
  Edit remains disabled. Added by mistake is a ledger adjustment to zero, not deletion.
- **Local-items import is not built.** Existing AsyncStorage inventory is retained
  and counted as On this device, never automatically migrated or shared by account.
- **Receipt OCR is not connected to backend inventory.** Receipt/camera/gallery
  entry points remain Coming soon in the default backend form.
- **Retry keys are lost on page reload or form unmount.** The same mounted draft
  safely reuses a key/payload after an ambiguous failure; web auth is also in memory.
- **Carrot and tomato lack Arabic aliases in the current starter catalog.** They
  display canonical names in Arabic and do not match an Arabic alias search.
  `tomato juice` is a different catalog food and may have an Arabic alias.
- **Native/network configuration still needs device acceptance.** LAN reachability,
  firewall, Android Metro loopback configuration and tunnel API overrides are
  described in README; URL-selection unit tests do not prove device connectivity.
