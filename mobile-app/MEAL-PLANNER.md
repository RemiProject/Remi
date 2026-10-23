# Manual Meal Planner

The existing `/feature?feature=planner` entry now opens the planner from More and
Home. No tab or duplicate discovery route was added. The five fixed tab positions
remain Home, Kitchen, Add, Health, More in both languages.

The screen supports Monday-based weeks, previous/next week, Today, day selection,
Breakfast/Lunch/Dinner/Snacks, an add modal, planned-meal details, recipe details,
and explicit removal with localized feedback. It reuses the two existing sample
recipes, images with fallbacks, shared controls, themes and language preference.
No AI, nutrition, shopping-list generation or inventory deduction is implemented.

`PlannerProvider` follows the existing Context/useSyncExternalStore architecture.
`PlannerStore` uses the existing AsyncStorage adapter convention, separately from
inventory, at `remy.meal-planner`: `{ version: 1, meals: [...] }`. Each planned meal
stores a stable ID, local `YYYY-MM-DD` date, meal-period ID and recipe ID. Recipe
content is not duplicated in persistence. Unknown recipe references remain readable
and display an unavailable state with a removal action.

Hydration never writes. Missing storage starts empty; invalid/corrupt/unsupported
storage blocks writes and offers retry without reset. Mutations are serialized,
persist before publication and retain previous data on write failure. Inventory
storage is never written by the planner. Persistence is local to this installation
or browser origin, with no cross-tab/process coordination or cloud synchronization.
Calendar arithmetic uses local noon and date-only strings rather than UTC conversion.

English/Arabic labels and feedback are in `src/i18n/planner.ts`. Dates are formatted
with the selected locale using the Gregorian calendar. The modal date field accepts
the established YYYY-MM-DD format with digits 0–9; no native date picker was added.
Arabic content uses local RTL direction; the tab bar remains fixed LTR.

Automated checks cover persistence/restart, correct date/period assignment, removal,
failed writes, corrupt reads/retry, subscriptions, month/year/leap boundaries, catalog
parity, mocked add/remove UI, missing references, and existing inventory/navigation
regressions. Tests use disposable in-memory storage, not user data.

Physical-device modal/keyboard handling, screen-reader focus, horizontal calendar
scrolling, RTL rendering, themes and actual installation restart remain manual checks.
Only the current sample catalog is selectable. No serving quantities are inferred.
