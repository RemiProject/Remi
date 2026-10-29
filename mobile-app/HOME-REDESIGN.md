# Home image-rich redesign

Mobile command examples use the current pnpm-only workflow (`pnpm.cmd` on Windows; `pnpm` on macOS/Linux). Recorded validation results remain historical; the commands shown are current equivalents.

The existing `/` route (`src/app/(tabs)/index.tsx`) still re-exports the same Home
screen. Five-tab navigation, the central Add chooser, inventory domain/provider,
repositories, saved data, appearance preference and all existing assets are unchanged.
No packages were added. The project remains named Remy; `Remi Blue` remains its exact
palette token name.

## What changed

- Compact greeting/title, notifications-preview action and Home language selection.
- Immediate local search across saved food names and sample recipe titles/ingredients.
  All/Food/Recipes scopes are functional; blank query shows all entries within the scope.
  No user inventory is seeded from demos. Unknown searches have an explicit no-match state.
- Photo-backed kitchen overview with real storage counts and Kitchen/Add navigation.
- Horizontal Use First cards derived from actual entered expiration dates. Cards open
  the existing saved-item detail route. View all food opens Kitchen. Unknown dates stay
  unknown; no photo is claimed to depict the user's food.
- Horizontal, image-rich sample recipe cards reuse the existing two demo recipe models.
  Cards open an accessible, scrollable sample preview modal with description/time and
  translated example ingredients. Full recipe instructions are explicitly unavailable.
- Compact nutrition illustration reuses the existing fixture values and clearly says
  that these are mock values, not the user's intake or real estimates.
- Planner/Shopping shortcuts and the notification action open the existing honest
  availability-notice routes; no messages, planning or notifications are simulated.

## Localization and images

No localization system or suitable food photos were present before this task.
`src/i18n/home.ts` establishes typed English/Arabic Home catalogs and unit labels.
Home defaults from available locale/RTL signals and offers explicit session switching.
Text alignment, writing direction, rows and horizontal rails respect the Home direction
without globally forcing RTL or changing other screens. User-entered food names are
preserved. The rest of the app is still English; this is not full-app localization.
The generic greeting avoids inventing a user's name when no profile is connected.

`FoodImage` uses the already-installed Expo Image with caching and fixed image bounds.
Stock-photo URLs are centrally defined; photos are labeled illustrative. A theme-aware
icon fallback appears while loading, if the source is missing, and after image errors.
Changing the source remounts image state. No remote image is used as a brand logo.
Suitable approved/licensed bundled food assets should replace stock URLs for an offline
production release. Existing logo/template artwork was preserved rather than repurposed.

Fredoka, Nunito and Shrikhand files are still missing. Existing font loading/fallbacks
are preserved and actual text remains in system fonts. Arabic font coverage and native
RTL rail starting positions need device verification.

## Files

Modified: `src/screens/home-screen.tsx`.

Created:

```text
src/i18n/home.ts
src/data/home-content.ts
src/components/food-image.tsx
scripts/test-home.cjs
HOME-REDESIGN.md
```

## Verification

- `pnpm.cmd run typecheck`: passed.
- `pnpm.cmd run lint`: passed after fixing an initial nested-component declaration and
  duplicate-import warning.
- `node --test scripts/test-home.cjs scripts/test-button-transform.cjs scripts/test-inventory.cjs`:
  16 tests passed. Covers search/scopes/Arabic recipe matching, catalog parity, image
  loading/error fallback/source reset, existing transform press/release regression,
  inventory validation and persistence operations.
- `pnpm.cmd exec expo export --platform web`: passed.
- `pnpm.cmd exec expo export --platform android --platform ios`: passed with approved Hermes execution.
- `git diff --check`: passed, with existing line-ending notices.
- No connected browser/app surfaces were exposed by the UI tool. No interactive visual,
  external photo availability, network loading, theme screenshot or native RTL review
  is claimed. Programmatic image tests use controlled component dependencies.

Manual acceptance: run `pnpm.cmd run web`; inspect 320/375/430 px widths and enlarged
text in Light/Dark/System. Add an actual food with a due date; check counts/Use First,
food detail and View all navigation. Search food names and recipe ingredients in both
languages/scopes. Open/close each sample recipe preview and the notification/shortcut
notices. Disable networking to check fallback visibility. Repeat empty/loading/corrupt
storage/read-write error states in a disposable test profile. Review Arabic text and
horizontal rail direction on real Android/iOS devices. No existing user data should
be cleared for testing.
