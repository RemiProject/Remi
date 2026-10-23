# Manual Shopping List

The existing More/Home Shopping List destination (`/feature?feature=shopping`) now
opens the implementation. No new bottom tab or duplicate route was added.

Supports manual add/edit, optional positive quantity, optional free-text unit (24
characters), optional stable category ID, purchase/unpurchase, name search, All/To Buy/
Purchased filters, category groups, real counts, confirmed individual deletion and
confirmed clearing of all purchased items. Names are trimmed, required and limited
to 100 characters. Quantities accept the existing positive decimal/scientific notation
convention with digits 0–9 and a dot; Arabic digits are not silently converted.

`ShoppingStore` and `ShoppingProvider` follow the existing AsyncStorage and
Context/useSyncExternalStore pattern. The isolated `remy.shopping-list` key stores
`{ version: 1, items: [...] }`. Items retain stable IDs, name, optional quantity/unit/
category, purchased status, and UTC creation/update timestamps. Editing retains ID,
creation time and purchase status. No sample shopping data is seeded.

Hydration never writes. Corrupt, unsupported or duplicate-ID lists block mutations
and expose Retry rather than resetting storage. Mutations are serialized and persist
before publication. Failed writes retain the saved list, checkbox state and open
draft/confirmation for retry. Read/write errors are localized. No inventory or planner
key is modified, and there is no automatic synchronization, deduction or generation.

English and Arabic labels use the existing persisted language preference. Screen,
forms and modal use local RTL/LTR layout and semantic Light/Dark/System tokens. The
fixed physical bottom-tab order is unchanged. No new dependencies were installed.

Automated tests use in-memory storage and mocked UI hooks: CRUD, toggle/unmark,
search/filter combinations, validation, restart, empty lists, corrupt/read/write
failures, confirmation before clear, duplicate-submit guard, Arabic labels, and
existing inventory/planner/navigation regressions. Real device keyboard behavior,
screen-reader interaction, visual RTL/theme rendering and restart storage still need
manual checks. Browser/app data clearing or uninstall can remove local lists; there
is no cloud backup or cross-tab/process synchronization.

Expo Doctor reports the existing five SDK patch-version mismatches; no unrelated
upgrades or force fixes were applied. Export color-environment warnings are unchanged.
