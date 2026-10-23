# Theme persistence fix

## Root cause

RemyThemeProvider initialized `useState('system')` on every mount and never read or wrote storage. More explicitly described appearance as session-only; Settings had no appearance selector. The native color-scheme hook already tracks system changes and did not need modification.

## Files changed

- `src/theme/provider.tsx`: existing provider now hydrates and persists appearance, serializes writes, guards late reads, and exposes saving/error state. No second theme provider or store.
- `src/components/appearance-controls.tsx`: shared accessible selector and localized saving/read/write feedback.
- `src/screens/feature-preview-screen.tsx`: appearance controls in the existing Settings screen.
- `src/screens/more-screen.tsx`: existing shortcut reuses the same controls; removes session-only message.
- `src/i18n/appearance.ts`: matching English/Arabic status/error resources.
- `src/i18n/inventory.ts`, `src/i18n/app.ts`, `src/data/feature-menu.ts`: Settings descriptions reflect available persistent appearance.
- `scripts/test-theme.cjs`: eleven focused provider regression tests using injected storage and mocked hooks.
- `scripts/test-kitchen.cjs`: existing screen harness recognizes the shared appearance component.
- This document.

Existing modified/untracked work was preserved. Changes were reviewed against the source read before editing; most source files are already untracked, so Git's tracked-file diff alone does not describe this patch. No inventory/planner/shopping schema, repository, route, tab order, language preference behavior, package manifest or lockfile changes were made by this fix.

## Storage and startup

Dedicated AsyncStorage key: `remy.preferences.appearance`. Values are plain strings: `light`, `dark`, `system`. Missing/invalid values default to system without writing during hydration. Read failure also defaults to system and is exposed in the selector. Inventory and other preference keys are untouched.

The provider withholds its child screens until the startup read settles, avoiding a flash of the wrong themed content. This may briefly show a blank startup surface; no new splash-screen configuration was introduced. Static web exports initially contain the application shell; client hydration loads the preference and mounts screens. This is not evidence of visually verified startup behavior.

A revision counter prevents a late initial read/error from replacing a newer explicit selection. Selections apply immediately. Writes are queued so rapid changes persist in order, with the last successful choice ultimately stored. The system value stays literal `system`; effective colors continue to follow the existing live system hook. Null/unknown system scheme resolves to light as before.

## Failure handling

Storage errors are caught. Failed writes retain the chosen appearance for the active session and display a localized warning that it was not saved and may reset on restart. Selecting the same option again retries. No misleading saved-success toast is shown; pending writes show Saving appearance. Earlier queued errors cannot replace the latest selection's status.

## Executed verification

- `npm.cmd run typecheck`: exit 0, no TypeScript errors.
- `npm.cmd run lint -- --no-cache`: exit 0, no lint errors/warnings.
- `node --test scripts/test-theme.cjs scripts/test-home.cjs scripts/test-kitchen.cjs scripts/test-button-transform.cjs scripts/test-inventory.cjs scripts/test-planner.cjs scripts/test-shopping.cjs scripts/test-receipt.cjs scripts/test-cooking.cjs scripts/test-audit-regressions.cjs`: 73 tests passed, 0 failed/skipped/cancelled. Includes 11 new theme tests.
- `npx.cmd expo export --platform web --platform android --platform ios --output-dir dist/theme`: exit 0; all three platforms exported. Bundler emitted benign NO_COLOR/FORCE_COLOR warnings. A subsequent copy-only change clarified Settings descriptions; typecheck/lint and the complete test suite were rerun afterward.

Tests cover light/dark/system save and restart restoration, missing/invalid values, read/write failures, retry, repeated changes, late hydration, and system scheme changes. Injected storage and mocked hooks exercise the real provider code without touching user data. They do not prove physical AsyncStorage durability, actual OS appearance events, startup rendering, accessibility or device RTL rendering. No native build/device test or interactive visual review was performed.

## Manual device checks

1. Open More → Settings. Select Light, wait for Saving appearance to finish, completely close the app, then reopen. Confirm Light across Home, Kitchen, Add, More and other screens.
2. Repeat with Dark, then System. With System selected, change the device appearance while the app is open and while closed; verify it follows on resume/relaunch. With Light/Dark selected, verify OS changes do not override it.
3. Switch modes rapidly and cold-restart after pending writes finish; confirm the final choice. Immediately terminating before a write completes cannot guarantee persistence.
4. Check startup for wrong-theme flashes/blank duration on a slow device, and test web refresh after selecting a preference.
5. Switch English/Arabic and inspect selector alignment, screen-reader selected state and error/status messages.
6. In a disposable test build with an injected failing storage adapter, verify read/write warnings, immediate UI changes, retry and preservation of the prior stored value. Do not clear production app storage to simulate failure.
