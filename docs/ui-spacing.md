# Spacing and UI pass (version 3, `version-3-ui`)

What was wrong, judged by eye on the simulator in light, dark and Arabic, and what changed. Crème was not installed
on this Mac, so this pass works from Remi's own screens and its design brief (`DESIGN.md`).

## The rules applied

- **Groups by proximity:**
  - A heading sits close to what it names (4–12 pt) and far from the section above it (36 pt between Home sections).
  - A heading sits above its card, never inside it.
- **One control row per decision:** filters that are peers are text tabs (like the cookbook's), not a block of chips in a coloured box.
- **Content first:** rows show the thing (photo, name), then one quiet line of facts. Buttons that only open the row are dropped; the row itself is the button.
- **Colour means something:** in the kitchen only food due within 3 days turns pink, and expired food turns red. Everything else stays grey.

## Screens

| Screen | Before | After |
|---|---|---|
| Recipe page | Short photo; four yellow capsules competing with the title; servings beside the title | Taller photo that stretches when pulled and moves slower than the page; one white facts row; servings beside Ingredients, which they change; the title bar fades in on scroll |
| Kitchen | A yellow box of storage chips that wrapped to two rows, then a second chip row; 64 pt photos with loose rows; "Days until expiration: 2" | Storage as text tabs; one sort row (Expiry, Name, Use first); 56 pt photos; tighter rows with dividers; "2 days left" / "About 3 days left" in pink when due soon |
| Home | "Upcoming meals" heading inside its card, closed by two full-width buttons | Heading with a "Plan" link above the card; rows with photos; one text action to add ingredients to shopping. "In your shopping list" follows the same pattern |
| Planner | Three week links in a row, then the day chips, then the date; each meal a card with an "Open recipe" button | Day chips, then the date with ← → week buttons (and "Today" only when you are away from today); meals as photo rows that open the recipe, with a small "Remove" |
| Recipe cards | Instant | Press shrinks the card slightly (120 ms); the first cards fade up once (40 ms apart) on first load only |
| Text buttons | 48 pt tall boxes that pushed layouts apart | 32 pt tall visually, same 48 pt touch area |

Screenshots in `Design/version-3-sip-happy/screenshots/`: `light-22` to `light-26` and `ar-dark-07`.

## Shared code

- `TextTabs` (in `components/ui/core.tsx`): the cookbook's text tabs, now shared. `RecipeTabs` is the same component.
- `ActionRow` `dense`: tighter rows for long lists.
- `daysLeftLabel` (in `i18n/backend-kitchen.ts`): the expiry wording.

## Checks

- **Tests:** 449 app tests pass. The tests that checked the old layout (storage chips, the "Days until expiration" wording, effect order) were updated to check the new one.
- **Typecheck and lint:** clean.
- **Simulator:** checked in light and dark, and in English and Arabic.
- **iPhone 12:** installed.

## Still to do

- **Crème:** study it once it is installed, and apply what it does well.
- **Screens not yet reviewed in this pass:** shopping, food detail, Health and More.
