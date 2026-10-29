# Remy 0.4.0 — UX redesign and Dark Mode refinement

Mobile command examples use the current pnpm-only workflow (`pnpm.cmd` on Windows; `pnpm` on macOS/Linux). Recorded validation results remain historical; the commands shown are current equivalents.

## Problems identified from source inspection

- Home gave similar emphasis to the blue kitchen panel, tall inventory cards, recipe
  artwork, nutrition panels and repeated Add actions. Empty inventory still displayed
  sample content and repeated state messaging.
- Kitchen filters consumed many wrapped rows; individual food cards repeated category,
  storage, saved/sample labels and badge surfaces already conveyed elsewhere.
- Food details repeated title/quantity/status across several cards; Edit and Delete had
  equally strong filled-button presentation. Near-term date colors differed from list rows.
- More repeated the same preview notice on every row and boxed each icon in a colored panel.
- The chooser gave unavailable camera/receipt methods nearly the same prominence as
  working manual entry. Form hints competed with labels.
- Dark colors leaned toward saturated blue surfaces and had no dedicated navigation,
  input, placeholder, focus, pressed, disabled or modal roles. Several controls relied on
  opacity alone; selected controls lacked a visual shape/text cue.
- Delete confirmation had no safe-area or overflow handling. Long names, large text and
  short screens were concrete layout risks, although clipping was not reproduced visually.

## Screen decisions

- **Home:** compact greeting/heading; one neutral saved-inventory summary; Use First as
  compact rows with real date-derived status; one Add action. Empty inventory displays
  one first-food action. Recipe/nutrition mock content is behind an explicit sample-ideas
  toggle and remains labeled, with no personalized/AI or intake claim.
- **Kitchen:** title/count, search, two horizontal filter strips, result/reset row, then
  populated storage groups. Food rows show name, quantity and expiration status, with
  storage omitted when the group already supplies it. No virtualization was introduced.
- **Food details:** food name/quantity lead, then the same expiration label as list rows,
  one metadata surface and optional notes. Edit is primary; Delete is a quiet destructive
  text action until the explicit confirmation. All existing operation/error logic remains.
- **Chooser:** manual entry is the only primary action; the three unavailable methods
  sit in one quiet group, explicitly disabled and labeled unavailable.
- **Manual/edit form:** compact title/Cancel header; required fields grouped together;
  optional dates/notes separated by a heading. Hints recede below controls and errors
  replace hints rather than competing with them. Validation and draft/save behavior remain.
- **More:** appearance controls are immediately accessible; existing feature groups use
  compact rows and one overall preview notice. Community/Contact Us retain explicit
  unavailable text and availability routes. No top logo.
- **Health placeholder:** shared foundation component now uses the current primitives
  and a compact heading, without the oversized brand header. No Health feature added.
- **Bottom navigation:** five existing destinations/routes retained. Central Add still
  opens the chooser; selected tabs use bold/underlined labels as well as the selected
  surface. Focus is outlined. Labels can wrap as text scales.

## Theme and accessibility

All six exact brand palette values are preserved, including the name `Remi Blue`.
Dark page/surface/elevated roles now use calm charcoal/slate tones, with Sky Blue
restricted mainly to actions and focus/selected accents. Supporting text is neutral,
and warning/error surfaces and text are quieter without losing explicit status labels.

Centralized new roles cover subtle text, dividers, elevated surfaces, inputs/borders,
placeholders, selected controls, pressed surfaces, focus, disabled controls, navigation,
modal surfaces and overlay scrims. Existing semantic success/warning/error/destructive
roles remain. Active screens contain no hexadecimal/rgba color literals.

Buttons have visible focus treatment and a pressed shape change. Selected chips add a
checkmark plus the accessibility selected state. Input focus changes border thickness;
error text remains explicit. Disabled buttons/fields use dedicated colors rather than
fading all content. Shared row interactions have focus and pressed surfaces.

Delete confirmation now has a centralized overlay/modal surface, safe-area wrapper and
scrolling content for large text/long names. Busy-state cancellation remains blocked,
and deletion failures remain visible in the dialog. Actual modal focus, screen-reader
behavior and phone rendering still need interactive review.

Font loading/fallback code is untouched. Shrikhand/Fredoka/Nunito files are still absent
and are not claimed to be active. No fonts or images were downloaded. Logical/default
alignment, wrapping and existing directional-icon mirroring are retained; full Arabic
translations/RTL and Arabic numeral entry remain future work.

## Changed files

```text
src/theme/tokens.ts
src/components/ui/core.tsx
src/components/ui/icon.tsx
src/components/ui/form-field.tsx
src/components/ui/confirm-dialog.tsx
src/components/food-card.tsx
src/components/expiration-label.tsx       # New shared presentation component
src/components/foundation-screen.tsx
src/components/inventory-notice.tsx
src/screens/home-screen.tsx
src/screens/kitchen-screen.tsx
src/screens/food-detail-screen.tsx
src/screens/food-entry-chooser.tsx
src/screens/food-form-screen.tsx
src/screens/more-screen.tsx
src/app/(tabs)/_layout.tsx
UX-REFINEMENT.md
```

No dependencies, app/package configuration, lockfile, inventory domain/repositories/
provider, font-loading implementation or preserved template files were changed.
Existing user changes were not reverted. Package/app metadata still reads 0.1.0,
consistent with prior phases; the on-screen phase label now says 0.4.0.

## Automated verification

| Command/check | Result |
| --- | --- |
| `pnpm.cmd run typecheck` | Passed |
| `pnpm.cmd run lint` | Passed |
| `node --test scripts/test-inventory.cjs` | 10/10 passed using approved Node worker execution |
| `pnpm.cmd dlx expo-doctor` | 21/21 passed |
| `pnpm.cmd exec expo export --platform web` | Passed |
| `pnpm.cmd exec expo export --platform android --platform ios` | Passed using approved Hermes execution |
| `pnpm.cmd exec expo export --platform web --platform android --platform ios` | Final combined export passed on all three platforms |
| `git diff --check` | Passed, with existing line-ending notices |
| Inline Node contrast/palette assertions | 16 text pairings per theme passed 4.5:1; minimum light 4.84:1, dark 5.50:1. Input borders passed 3:1 (light 3.57, dark 3.49). Six brand colors unchanged. |
| Color-literal search across active screens/primitives | No hex/rgba literals found |

The first contrast check caught a light disabled-text ratio below the target; that
token was darkened and all checked pairings then passed. These calculations cover
selected token pairings, not a complete accessibility certification or visual QA.
Metro emitted NO_COLOR/FORCE_COLOR notices. Existing dependency audit warnings were
not re-audited or fixed; no packages were added/upgraded.

## Actual interactive/visual results

Browser inventory returned no available connected browsers or apps. No interactive
preview, screenshot inspection or native-device review occurred. Exports/type checks
verify compilation, not visual comfort, keyboard overlap, focus behavior or phone UI.

## Manual review checklist

Launch with `pnpm.cmd run web`. Repeat native checks on available compatible devices.
Use disposable test inventory and preserve saved data before any fault testing.

1. Inspect Home empty/loading/read-error/populated states. First-food action should lead
   to the existing form. With data, verify counts and Use First, including expired,
   today, within three days, future and missing dates. Expand/collapse sample ideas.
2. At 320/375/430 px widths and enlarged text, inspect all modified screens for wrapping,
   clipping and vertical scrolling. Check 100-character names and long notes/errors.
3. Search Kitchen; combine category/storage filters, including horizontally hidden
   choices; verify visible selection labels/checkmarks, reset, grouped rows and no results.
4. Add/edit from the chooser and empty states. Test every validation case, keyboard
   visibility/scrolling, decimal entry, malformed date pastes and rapid Save presses.
5. Open Details; verify quantity/location/dates/notes match saved inventory. Check the
   same urgency meaning/style in Details, Home and Kitchen. Test missing IDs.
6. Cancel and confirm deletion. Test long names, large text, short viewports, screen-reader
   focus and Android back. Force a failed write; dialog and data must remain. Retry.
7. Inspect Light/Dark/System on Home, Kitchen, Details, chooser, manual/edit form, More,
   Health and unavailable feature notices. Changes must apply immediately, including dialogs.
8. Use keyboard Tab/Enter in the browser and VoiceOver/TalkBack on devices; check focused
   outlines, selected-state announcements and expiration text in food-row labels.
9. Recheck add/edit/delete synchronization, restart persistence, corrupt-read protection
   and write failure/retry using the existing 0.3.0 acceptance procedures.

Remaining limitations: native keyboard/back behavior is unverified; native-stack
`beforeRemove` prevention still has the previously noted platform caveat; Cancel/back
still discards unsaved drafts; cross-tab storage synchronization is not implemented.
No new feature or persistence change is part of this redesign.
