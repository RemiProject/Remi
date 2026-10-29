# Optional food photos

Mobile command examples use the current pnpm-only workflow (`pnpm.cmd` on Windows; `pnpm` on macOS/Linux). Recorded validation results remain historical; the commands shown are current equivalents.

Manual Add/Edit supports camera capture, gallery selection, preview, replacement and
removal. These actions do not recognize food or fill in metadata. The Add chooser
also supports camera/gallery acquisition with review, retake/replacement and explicit
confirmation before opening the existing manual form with a validated managed photo
reference. Camera permission is requested only on tap; gallery uses the SDK's system
photo picker. Cancellation is not an error. Receipt scanning remains unavailable.
Inventory changes only when food details are validated and saved in the manual form.

## Compatibility and inventory integrity

- `remy.inventory` retains its key and envelope shape. Successful explicit mutations
  now write `version: 2`; items may contain an optional `photoRef`.
- Valid Version 1 inventory remains readable, byte-for-byte untouched on hydration.
  Existing IDs, timestamps, stable option IDs and validation rules remain intact.
- Version 1 rejects photo fields. Version 2 accepts only constrained relative photo
  identifiers. Corrupt/unsupported records remain protected; there is no reset path.
- Older app versions reject Version 2. There is no lossy automatic downgrade.

## Image storage and lifecycle

- Native: picker images are copied into `Paths.document/remy-food-photos`. Persisted
  identifiers are filenames, resolved against the current documents directory.
- Web: blobs live in IndexedDB `remy-food-photos`, store `photos`. Object URLs are
  generated for previews and revoked on cleanup; they are never persisted.
- No photo bytes are stored in AsyncStorage. Quality is requested at 0.75; images
  above 20 MiB are rejected rather than guaranteeing a particular resized dimension.
- Copy/blob transaction completion precedes exposing a new reference in the draft.
  Newly associated photos must resolve before an inventory write can commit.
- Failed preparation or inventory writes retain the previous saved reference/photo.
  Missing existing photos do not prevent inventory hydration or ordinary editing.
- Removed/replaced/deleted item photos are cleaned only after the inventory write
  succeeds and no committed item references them. Cleanup runs inside the existing
  serialized mutation queue. Cleanup failure leaves a safe orphan and does not report
  the already-committed mutation as failed.
- Interrupted acquisition, abandoned drafts and failed cleanup can leave unused files
  or blobs. No startup garbage collector is included: startup never deletes images
  based on potentially unreadable inventory. A future explicit maintenance operation
  would need its own reference checks and safeguards.
- Existing inventory serialization is scoped to one runtime, not concurrent browser
  tabs/processes. Browser storage eviction, cleared site data and app uninstall can
  remove images; missing images display fallbacks.

## Dependencies/configuration

SDK-compatible `expo-image-picker` and direct `expo-file-system` were installed with
`pnpm.cmd exec expo install expo-image-picker expo-file-system`. Camera/photo usage strings
are configured; microphone permission is disabled. Runtime feedback follows the shared
English/Arabic preference. System permission-dialog wording follows native configuration
and OS behavior; standalone binaries need rebuilding to apply config changes.

## Verification

- `pnpm.cmd run typecheck`: passed.
- `pnpm.cmd run lint --no-cache`: passed.
- `node --test scripts/test-home.cjs scripts/test-kitchen.cjs scripts/test-button-transform.cjs scripts/test-inventory.cjs`: 35 passed.
- `pnpm.cmd exec expo export --platform web`: passed.

Tests use injected storage and mocked native/IndexedDB/picker APIs, never user inventory.
They cover Version 1 compatibility/no hydration writes, Version 2 validation/write
behavior, restart reference retention, copy interruption, replacement/removal failures,
shared references, missing images, cancellation, denied camera permission and preview
URL cleanup, alongside existing inventory/Home/Kitchen/Button regressions.

Real camera/gallery permissions, image format handling, native file persistence across
restart, real IndexedDB reload behavior, native keyboard/screen-reader behavior and
visual RTL/theme checks remain manual acceptance tasks. Web export is a build check.
Installation reports 29 dependency audit findings and an optional unrs-resolver script
notice; no unrelated upgrades or force fixes were applied. Export emits existing
NO_COLOR/FORCE_COLOR warnings. Brand font assets remain unavailable.
