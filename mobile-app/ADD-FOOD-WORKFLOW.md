# Remy 0.3.0 — Add Food Workflow

## Implementation

Manual creation, editing, confirmed deletion and local persistence now work through
one shared inventory provider above the root Stack. Home, Kitchen and food details
subscribe to that store. The central Add button still opens `/food-entry`; its
existing `/add` link is retained for compatibility. Add Manually replaces the chooser
with `/food/manual`. Editing uses `/food/edit/[id]`; `/food/[id]` remains the details route.
No new bottom destination was added. Camera, gallery and receipt choices remain unavailable.

The local inventory starts empty. Seven demo foods remain untouched in
`src/data/kitchen-demo.ts`, explicitly named/labeled samples and never seeded into
storage. Home recipe and nutrition examples remain separate and visibly illustrative;
they do not claim to reflect saved inventory or actual intake. Home's greeting is
generic because no user account/profile is connected.

## Domain and persistence rules

- Stable category/unit/storage IDs are separate from English display labels.
- Food names are trimmed, required and limited to 100 characters. Quantities must be
  positive finite numbers; decimal and scientific notation are accepted, not hex/partial values.
- Notes are optional and limited to 1,000 characters. Only the inventory schema is saved,
  including generated non-security IDs and UTC created/updated timestamps.
- Optional dates must be actual calendar dates exactly matching `YYYY-MM-DD`.
  Blank means unknown. Historical and future dates are accepted. When both dates
  exist, expiration must be on or after purchase; feedback appears on expiration.
  Date inputs do not truncate malformed pasted dates into valid dates.
- Home Use First sorts past entered dates, then dates due within three days, capped
  at three items. Missing dates are explicitly unknown. Date-only comparisons avoid
  DST offsets; one shared clock refreshes on app resume and each minute.
- Dates are user-entered information, not food-safety assessments.
- `remy.inventory` holds `{ "version": 1, "items": [...] }`. Reads validate schema version,
  all fields, supported IDs, dates, timestamps, positive quantities and unique IDs.
- Reads never write. Missing storage hydrates to an empty inventory. Corrupt/unreadable
  data blocks mutations, exposes Retry, and remains intact; there is no automatic reset.
- Store mutations are serialized. Each calculates its next state from the latest
  committed state, persists first, then publishes. Failed writes reject and retain the
  previous inventory. The queue remains usable for retry. Editing preserves ID and creation time.
- Forms disable editing/submission while saving and retain draft/error on failure.
  Cancel and hardware-back handling are guarded while saving; gestures are disabled on forms.
  Deletion requires an explicit confirmation and retains its dialog/data on failed persistence.

Serialization is scoped to one app runtime, not a cross-tab/process lock. No backend
sync, encryption, account isolation or multi-device conflict resolution is implemented.
AsyncStorage is not used for secrets. Persistence depends on device/browser storage
availability and may disappear after uninstall or clearing application/site data.

## Changed files in this phase

Modified:

```text
package.json                         # Only AsyncStorage added
package-lock.json                    # npm's resulting lockfile retained
src/app/_layout.tsx
src/components/ui/core.tsx
src/components/food-card.tsx
src/theme/tokens.ts
src/screens/food-entry-chooser.tsx
src/screens/home-screen.tsx
src/screens/kitchen-screen.tsx
src/screens/food-detail-screen.tsx
src/screens/more-screen.tsx          # Phase label only
DESIGN-SYSTEM.md                     # Link to this phase's documentation
```

Created:

```text
src/domain/inventory.ts
src/repositories/inventory-repository.ts
src/repositories/async-storage-inventory-repository.ts
src/repositories/inventory-store.ts
src/providers/inventory-provider.tsx
src/components/inventory-notice.tsx
src/components/ui/form-field.tsx
src/components/ui/confirm-dialog.tsx
src/screens/food-form-screen.tsx
src/app/food/manual.tsx
src/app/food/edit/[id].tsx
scripts/test-inventory.cjs
ADD-FOOD-WORKFLOW.md
```

Existing project configuration, core SDK versions and template files were preserved.
App/package version metadata remains 0.1.0, as in prior phases; 0.3.0 is the workflow
phase designation. No unrelated direct dependencies were changed.

## Commands and verification

| Exact command | Result |
| --- | --- |
| `npx.cmd expo install @react-native-async-storage/async-storage` | Sandbox network fetch failed; approved retry installed SDK-compatible **2.2.0**, adding three packages including transitives. |
| `npm.cmd run typecheck` | Initial stale generated-route error fixed by regenerating route types; passed. |
| `npm.cmd run lint` | Initial two UTF-8 BOM warnings removed; passed. |
| `npx.cmd expo-doctor` | 21/21 passed. |
| `npx.cmd expo export --platform web` | Passed. |
| `npx.cmd expo export --platform android --platform ios` | Passed with approved Hermes process execution. |
| `node --test scripts/test-inventory.cjs` | Sandbox worker spawn failed; approved retry passed **10/10** built-in Node tests. No testing dependencies added. |
| `git diff --check` | Passed; Git emitted existing line-ending conversion notices. |
| `npx.cmd expo start --port 8082` | Used to refresh generated route types; Metro started. Optional DevTools emitted sandbox spawn EPERM. Temporary server stopped afterward. |

Tests exercise the actual domain, repository and store through an in-memory adapter:
validation/date relationships, empty first launch/hydration protection, concurrent writes,
pending-write visibility, edit identity, persistence across new store instances, deletion,
failed create/edit/delete retries, corruption/unsupported versions/duplicates and read failures,
plus Use First and stable-ID filters. They do not touch the user's inventory.

Install still reports 29 audit findings (11 moderate, 18 high) and the existing optional
`unrs-resolver` install-script notice. No force fixes or unrelated upgrades were applied.
Metro emitted NO_COLOR/FORCE_COLOR notices. Brand font files and complete Arabic/RTL
support remain unavailable. Physical-device behavior and interactive UI behavior were
not verified; successful exports are build checks, not phone UI verification.

## Manual acceptance steps (not yet executed on a device)

Use a disposable test installation/profile. Preserve a backup before fault testing.

1. **First launch:** open Home and Kitchen with no `remy.inventory` value. Wait for loading
   to finish; expect zero counts and an Add-first-food state, never seven demo foods.
2. **Valid add:** tap central Add → Add Manually. Enter Spinach, Produce, 150 g,
   Refrigerator, and optional valid dates/notes. Save; expect saved details and no duplicate
   item from rapid repeated Save taps.
3. **Validation:** try blank/whitespace name, zero/negative/nonfinite quantity, missing
   selections, `2026-02-30`, `2026-2-01`, a date with trailing characters, and expiration
   before purchase. Expect field errors and no save. Confirm valid historical dates work.
4. **Synchronization:** return to Kitchen, search and combine filters; inspect Home storage
   counts. Test no expiration, past expiration, today, within three days and later dates.
   Expect accurate labels/ordering and no invented nutrition results.
5. **Edit/delete:** edit name, quantity, unit, location, dates and notes. Save and inspect all
   three screens. Clear optional dates/notes. Confirm identity/creation timestamp are retained
   in the envelope. Cancel deletion first; then confirm it and expect removal everywhere.
6. **Restart:** fully restart the app on the same installation (web: same origin). Verify
   saved additions/edits remain, and deletions stay removed. No demo reseeding occurs.
7. **Corruption:** in a disposable web profile, back up `localStorage.getItem('remy.inventory')`,
   replace only that key with invalid JSON, then reload. Expect an error instead of an empty
   usable inventory, blocked mutations, and unchanged corrupt bytes. Restore the exact
   backup and tap Retry; valid data should return. Also test unsupported version/duplicate IDs.
8. **Storage failures:** `node --test scripts/test-inventory.cjs` reproducibly covers rejected
   reads/writes through injected adapters. For a web UI write-failure check, temporarily make
   `Storage.prototype.setItem` throw only for `remy.inventory` in DevTools, preserving the
   original function. Add/edit/delete; expect visible error, retained form/dialog and unchanged
   inventory. Restore the original function and retry. Read failure can also be tested in an
   environment denying storage access on launch; expect Retry and no writes. Do not clear
   unrelated site/application storage.
9. **Appearance/device:** switch More between Light/Dark/System, inspect fields and errors,
   keyboard visibility, selection controls and confirmation. Test Android hardware back,
   iOS dismissal gestures, deep links, and back behavior while a deliberately delayed write
   is pending. Browser closing/reloading and OS termination cannot preserve an unsaved draft.
