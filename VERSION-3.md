# Version 3: "Sip happy" redesign, Mob-style cooking

Version 3 builds on Version 2 and its planning/onboarding work (RemiProject/Remi#24).
It changes how Remi looks and how it feels to cook with, one element at a time.
Each element is its own commit on the `version-3` branch.

- **Look:** the Mob meal-planner app's patterns: clean white photo cards, bold sans
  headings, pill buttons, horizontal recipe rails, a planner-first Home.
- **Cooking:** Mob's full-screen cook mode: one step per page, a progress bar,
  ingredients one tap away, and a screen that stays on.
- **Colour:** a new three-colour palette.

Mob is a reference for patterns only. Its copy, images, icons and fonts are not used.

## The palette

| Name | Hex | Role |
|---|---|---|
| Lemon Yellow | `#F8E45C` | **Base.** Hero areas, selected chips, highlights. In dark mode it becomes the action colour |
| Cobalt Blue | `#1734BE` | **Action.** Buttons, links, active tab, focus rings, key text. In dark mode it becomes the hero colour |
| Hot Pink | `#ED2B8C` | **Pop, used sparingly.** The quick-add button, cook-mode timer and progress, and the "to use soon" highlight. It is never used for body text on white (3.9:1). Pink text uses `#C2146C` (5.7:1) instead |

Supporting colours are derived from these hues rather than from grey:

- **Ink:** `#0E1440`.
- **Secondary text:** `#4B5070` and `#5E6383`.
- **Paper:** `#FFFDF4`.
- **Pale lemon:** `#FCF4C4`.
- **Dark mode:** navy `#0B1030`, surfaces `#151B45` and `#1E2658`.

Every text/background pair in `src/theme/tokens.ts` has been checked: body text is
at least 4.5:1 and input borders at least 3:1. The ratios are in the tokens file's
comments.

## Checklist

Legend: ✅ done · ⏳ in progress · ⬜ to do

| # | Element | What changes | Status |
|---|---|---|---|
| 1 | Colour tokens | New palette in light and dark, plus `accent`/`accentText`/`onAccent` tokens | ⬜ |
| 2 | Typography | Bold DM Sans titles and headings replace the DM Serif display face. The paper texture is removed | ⬜ |
| 3 | Core components | Pill buttons, chips that don't reflow when selected, white cards with soft depth, pill search | ⬜ |
| 4 | Tab bar | Cobalt active tab with a lemon indicator, hot-pink quick-add button | ⬜ |
| 5 | Home | Lemon hero with greeting and search, "Cook tonight" photo hero card, Upcoming meals banner with thumbnails, recipe rail, shopping rail. No hard-coded colours | ⬜ |
| 6 | Recipe detail | Full-bleed photo, time/servings/difficulty pills, servings stepper, Ingredients/Method switch, pinned **Start cooking** | ⬜ |
| 7 | Cook mode | Full screen, segmented progress bar, swipe between steps, large step text, step timer, ingredients panel, screen kept awake | ⬜ |
| 8 | Shopping list | Compact checkbox rows instead of tall cards. Clean quantities ("50 g", not "50.000 g") | ⬜ |
| 9 | Onboarding and planner | Restyled through the new tokens and components. Planner servings shown as "4 servings", not "4.00" | ⬜ |
| 10 | Design docs | `DESIGN.md` and `PRODUCT.md` describe the new visual world | ⬜ |
| 11 | Verification | Typecheck, lint and tests pass. iOS Simulator walkthrough in light and dark with screenshots | ⬜ |

## Log

Each finished element is recorded below with what was done and how it was checked.
