# Phase 2 — Kitchen Inventory UI/UX

Mobile command examples use the current pnpm-only workflow (`pnpm.cmd` on Windows; `pnpm` on macOS/Linux). Recorded validation results remain historical; the commands shown are current equivalents.

## Focused filter/Settings refinement

Kitchen no longer displays language controls. More → Settings uses its existing
`/feature?feature=settings` route to expose LanguageControls and the existing
`remy.preferences.language` preference. Home's existing selector remains available;
both selectors use the same provider, so Settings updates supported Home/Kitchen/
inventory labels without another language state. Other feature notices are unchanged.

Search stays visible. A compact Filters button counts active storage/category/Use First
predicates; sorting is summarized separately, not counted as a filtering predicate.
The safe-area, scrollable modal stages selections. Apply publishes them; Close/back
discards pending edits. Clear filters resets modal selections (including default name
sorting), and Apply commits that reset. Opening dismisses the search keyboard.

The result count and active summary remain outside. No-results content is compact and
has one subtle recovery action. If search alone would match but filters exclude it,
Clear filters preserves the query. Otherwise Clear search preserves applied filters.
No selection is changed automatically. Empty inventory keeps its separate Add action.

Changed: `src/screens/kitchen-screen.tsx`, `src/screens/feature-preview-screen.tsx`,
`src/data/feature-menu.ts`, `src/components/ui/icon.tsx`, `src/i18n/inventory.ts`,
`src/utils/kitchen-view.ts`, `scripts/test-kitchen.cjs`, and this documentation.
Inventory architecture/schema/storage, language provider/key, Home implementation,
routes, palette, dependencies and Button transform fix were not modified.

Verification: `pnpm.cmd run typecheck`, `pnpm.cmd run lint --no-cache`, and
`node --test scripts/test-home.cjs scripts/test-button-transform.cjs scripts/test-inventory.cjs scripts/test-kitchen.cjs`
passed (23/23 tests). `git diff --check` passed with existing line-ending notices.
New tests use a controlled component/hook harness and cover draft Apply/Close/Clear,
single-action no-results recovery and clearing search. An initial test selected the
background Clear button rather than the modal's Clear button; the harness was corrected.

Native visual/focus/back behavior is unverified. Manually open More → Settings, change
language and revisit Home/Kitchen; restart to confirm persistence. In Kitchen, open the
modal with the keyboard visible, try combined filters/sorts, Apply, reopen/Close, Clear
then Apply, and no-match queries. Inspect 320 px widths, large text, RTL, themes, modal
scrolling and native back. No saved inventory should be cleared for testing.

The remainder below documents the original Phase 2 implementation.

## Scope and preservation

Existing inventory repository, InventoryStore, InventoryProvider, subscriptions,
InventoryItem schema, `remy.inventory` key and versioned persistence envelope were
not modified. No saved inventory was read/reset/migrated by development tools. No
dependencies or routes were introduced. Five-tab navigation, manual add/edit/delete,
Home search/recipe previews, and the Button transform omission fix remain in place.

The requested `ui/food-card.tsx` and `ui/expiration-label.tsx` paths did not exist;
their existing implementations at `src/components/` were updated instead of duplicated.

## UI and behavior

- Header shows a concise saved-inventory count and existing Add chooser entry.
- Search operates on actual saved food names. Combined storage/category selections
  preserve stable domain IDs; reset clears search, category, storage, priority and sorting.
- Clearly labeled filter/sort controls wrap at narrow widths, keeping selections visible
  and avoiding platform-specific horizontal-scroll starting offsets. Selected chips retain
  checkmarks, accessibility selected state and existing focus/pressed styling.
- Sorting by name or expiration applies within storage groups. Missing expiration dates
  sort last; ties use localized name ordering then stable ID. Sorting never mutates saved arrays.
- Use First only includes entered dates in the past or within three days; missing dates
  and later dates are excluded. It is not capped to Home's three-item display limit.
- Food rows have theme-aware category glyph illustrations, names, localized quantities/
  units and shared date-derived urgency. Grouped rows omit redundant storage text, while
  accessibility labels retain storage/category context. Glyphs are decorative category
  illustrations, not stock photos of actual food. No image fields are persisted.
- Empty inventory, no matches, loading, saving and read/write failure notices reuse
  existing primitives. Add/Retry/Reset/detail navigation remain functional.

## Shared language preference

`LanguageProvider` is mounted above the existing navigation/inventory tree. It uses
the already-installed AsyncStorage package, with **only** the separate
`remy.preferences.language` key storing `en` or `ar`. No duplicate inventory repository
or settings framework was introduced.

Home's former local language state now consumes this shared provider. Home and Kitchen
use the same LanguageControls, and changes persist before being published. Initial
hydration disables changes; failed reads block writes and expose Retry. Invalid stored
language values are left untouched. Failed writes keep the previous language and expose
an error. Writes are serialized and duplicate in-flight choices are guarded.

Kitchen uses `src/i18n/inventory.ts`, extending the existing Home catalog pattern and
reusing Home's localized unit labels. Locale-sensitive number/name formatting is applied
only for display. Persisted category/storage/unit IDs and dates are unchanged.

Home and Kitchen set view direction locally rather than globally forcing RTL. Food rows
align mixed-language names explicitly and correct chevrons relative to native RTL state.
Kitchen's controls wrap rather than horizontally scroll; Home's existing horizontal rails
are preserved. Shared inventory notices/expiration labels are translated wherever reused.
This does **not** translate all other screens or bottom-tab labels. Brand font files are
still absent, and system-font fallbacks remain active.

## Changed files and reasons

```text
src/screens/kitchen-screen.tsx              # Layout, localized controls, sort/priority UI
src/components/food-card.tsx                # Category illustration, translated metadata/labels
src/components/expiration-label.tsx         # Shared translated urgency presentation
src/components/inventory-notice.tsx         # Shared translated loading/error/retry states
src/components/ui/core.tsx                  # Optional ActionRow leading slot + RTL alignment
src/screens/home-screen.tsx                 # Replace local language state with shared preference
src/app/_layout.tsx                         # Mount minimal language provider
src/providers/language-provider.tsx         # New shared, persisted language preference
src/components/language-controls.tsx        # New shared language/error/retry UI
src/i18n/inventory.ts                       # New typed EN/AR inventory labels
src/utils/kitchen-view.ts                   # New pure display filtering/sorting helper
scripts/test-kitchen.cjs                    # New focused display/preference tests
KITCHEN-PHASE-2.md
```

## Verification

| Command | Result |
| --- | --- |
| `pnpm.cmd run typecheck` | Passed |
| `pnpm.cmd run lint --no-cache` | Passed |
| `node --test scripts/test-home.cjs scripts/test-button-transform.cjs scripts/test-inventory.cjs scripts/test-kitchen.cjs` | 21/21 passed, including all three requested existing suites |
| `pnpm.cmd dlx expo-doctor` | 21/21 passed |
| `pnpm.cmd exec expo export --platform web` | Passed |
| `pnpm.cmd exec expo export --platform android --platform ios` | Passed with approved Hermes execution |
| `git diff --check` | Passed; existing line-ending notices |

Focused Kitchen tests cover non-mutating combined filters, name/expiration sorting,
unknown dates last, real-date priority selection, empty results, EN/AR catalog parity,
language restoration across provider instances, failed language reads/writes and inventory
key isolation. Preference tests use a controlled hook/storage harness, not a native host.
An initial test mock had incorrect default-export interop; the harness was corrected and
all tests passed. No test touches the user's saved inventory.

## Interactive status and manual review

Browser tooling exposed no connected apps/browsers. No visual/native interaction tests
were performed. Bundle success does not establish phone layout or RTL correctness.
Metro emitted existing NO_COLOR/FORCE_COLOR notices. Existing audit warnings, missing
brand font assets and native navigation caveats remain outside this focused phase.

Manual review with `pnpm.cmd run web` and available native devices:

1. Choose Arabic in Home, switch to Kitchen, restart and verify the same persisted choice.
   Repeat English. Force preference storage failures in disposable test storage and retry.
2. Inspect 320/375/430 px widths, large text, long English/Arabic food names, RTL alignment,
   chevrons and wrapping chips in Light/Dark/System. Recheck Home's horizontal rails.
3. Combine search/category/storage filters and reset. Sort by name and expiry inside groups.
   Test missing dates, past dates, today, within three days and later dates; toggle Use First.
4. Add/edit/delete through existing routes; verify Home/Kitchen/details synchronize and
   restart persistence stays intact. Camera/gallery/receipt methods must remain unavailable.
5. Check loading, empty, no results, read corruption and write failures with disposable data;
   no failed read should create an empty usable inventory or overwrite stored bytes.

No camera, gallery, OCR, AI, backend, authentication, nutrition estimation or inventory
schema migration is implemented by this phase.
