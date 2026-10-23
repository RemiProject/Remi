# Remy 0.2.0 — Design System and Core UI

The subsequent manual-entry/persistence phase is documented in [ADD-FOOD-WORKFLOW.md](./ADD-FOOD-WORKFLOW.md).
The statements below describe the historical 0.2.0 scope.

This UI phase builds on the existing 0.1.0 foundation. Existing app configuration,
package metadata, dependencies and lockfile are unchanged. The package/app version
still reads 0.1.0 intentionally; 0.2.0 here identifies the reviewed implementation phase.
No user changes were reverted and preserved template files remain in place.

## Implemented

- Semantic light/dark colors, status colors, spacing, radii, typography roles.
- Shared text, screen, card, button, chip, badge, search, section and empty-state primitives.
- Cross-platform icons using the already-installed `expo-symbols` package.
- Home: sample greeting, storage counts, Use First, two recipe ideas, nutrition example,
  Kitchen/Health entry points and Add chooser entry point. Mock data is explicitly labeled.
- Kitchen: name search, combined category/storage filters, storage groups, food quantity,
  units and details, no-results state and empty-inventory component state.
- More: all eleven requested entries grouped into three menus with no top logo.
  Community and Contact Us have explicit unavailable notices. Other features open a
  shared availability screen rather than fake services.
- Five bottom destinations remain. Add is exposed as a button and opens the root
  food-entry modal while preserving the active tab. The `/add` deep link also shows
  the chooser. The four entry methods are preview cards, all currently unavailable.
- Session appearance controls remain in More.

## Source map / phase changes

| Files | Purpose |
| --- | --- |
| `src/theme/tokens.ts`, `src/theme/fonts.tsx` | Expanded tokens and local-only font-loading structure |
| `src/components/ui/core.tsx`, `src/components/ui/icon.tsx`, `src/components/food-card.tsx` | Reusable UI and inventory cards |
| `src/data/kitchen-demo.ts`, `src/data/feature-menu.ts` | Typed sample inventory/profile/recipe/nutrition data and menu definitions |
| `src/screens/home-screen.tsx`, `kitchen-screen.tsx`, `more-screen.tsx` | Core UI screens |
| `src/screens/food-entry-chooser.tsx`, `food-detail-screen.tsx`, `feature-preview-screen.tsx` | Chooser, mock details and honest availability notices |
| `src/app/_layout.tsx`, `src/app/(tabs)/_layout.tsx` | Font provider, root modal and updated tab buttons/icons |
| `src/app/(tabs)/index.tsx`, `kitchen.tsx`, `more.tsx`, `add.tsx` | Thin route adapters |
| `src/app/food-entry.tsx`, `src/app/food/[id].tsx`, `src/app/feature.tsx` | Additional thin routes outside bottom navigation |
| `src/components/app-tabs.web.tsx` | One obsolete `/explore` href changed to `/kitchen` so the preserved template compiles against generated typed routes |

## Font and asset limitations

No Shrikhand, Fredoka or Nunito font files were present. No font or imagery downloads
were performed. `src/theme/fonts.tsx` uses Expo Font and selects custom families only
after registered local files load successfully, falling back safely on errors. The
registry is deliberately empty until licensed files are supplied. Planned roles:
Shrikhand for occasional brand text, Fredoka for headings/selected controls, Nunito
for body/form text. Current rendered text uses system fonts, not the brand fonts.

No Remy references were attached in the task. Generated Expo artwork is preserved
as temporary launch artwork; no remote image URLs are used. Recipe cards use icon
panels, not photography. Layout uses logical/default alignment and directional icon
mirroring for future RTL; translations and complete Arabic/RTL behavior are deferred.

## Validation

- `npm.cmd run typecheck`: passed after correcting the preserved template's obsolete href.
- `npm.cmd run lint`: passed.
- `npx.cmd expo-doctor`: sandbox registry fetch failed (ENOTCACHED); approved retry passed 21/21.
- `npx.cmd expo export --platform web`: passed.
- `npx.cmd expo export --platform android --platform ios`: passed with approved Hermes execution.
- Six Node assertions against the actual `filterFoods` implementation passed: all items,
  normalized case/whitespace search, combined filters, incompatible filters, missing name,
  and empty inventory.
- `git diff --check`: passed with existing line-ending notices.
- Visual review attempted through browser tooling, which returned no available browsers.
  No visual/interaction or physical-phone verification is claimed. The temporary Metro
  server was stopped. Starting it emitted a sandbox EPERM notice for optional DevTools.

Metro emitted NO_COLOR/FORCE_COLOR notices. The 0.1.0 registry audit findings remain
unresolved; dependencies were not changed or audited again during this phase.

## Remaining scope

No persistence, entry forms, camera, upload, recognition, OCR, backend, AI, chat,
authentication, social features, message delivery or real nutrition analysis.
More preview notices are intentionally shared rather than complete secondary screens.
Before release, supply licensed fonts, review Arabic glyphs and RTL, and visually test
the screens, keyboard, chooser/back behavior and themes on physical iOS/Android devices.
