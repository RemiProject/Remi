# Feel (haptics, sound, motion) and the Nutrition page

Version 3, `version-3-ui` branch. Motion follows the Emil Kowalski rules the project uses (`animate-expo`): animate only
what a person causes or needs explained, keep it on the UI thread, respect Reduce Motion. The Nutrition page follows
the app-screen rules from the Taste skill: one question per screen, the answer biggest, a finding read first.

## Haptics and sound

`mobile-app/src/services/feedback.ts` gives every action one cue, fired at the moment the action lands:

| Cue | Haptic | Sound | Where |
|---|---|---|---|
| `select` | selection tick | none | Tabs (only when the tab changes), chips, the servings stepper, cooking steps, the step timer button |
| `tick` | light impact | `tick.wav` | Checking off a shopping item |
| `pop` | light impact | `pop.wav` | Adding to the shopping list |
| `success` | success notification | `success.wav` | Food added to the kitchen, stock updated, receipt added, recipe saved from a link, meal cooked, a step timer finishing, any action that reports success |
| `remove` | medium impact | `remove.wav` | Removing a shopping item or a saved recipe, deleting the account |
| `error` | error notification | `error.wav` | Any failed action, a failed recipe save or account deletion |

- **Settings → Feel** has a Sounds switch and a Haptics switch, saved on the phone (`remi.feedback.v1`).
- Sounds follow the ring/silent switch, mix with music instead of stopping it, and play at 60% volume.
- No cue fires on scrolling or on entrances nobody caused, and every cue has a visual twin, so turning both off loses no information.
- Native modules load lazily: on web and in the Node tests the service does nothing.
- **The sounds are synthesized** by `mobile-app/scripts/make-sounds.py` (soft sine tones, 2 ms attack, exponential decay; 8–33 KB each). They are original, so there is nothing to license. Run the script again to retune them.

## Motion

| What | How | Why |
|---|---|---|
| Buttons | Scale to 0.98 on press-in, 120 ms, strong ease-out (already there) | Feedback |
| Chips | Scale to 0.96 on press-in, 120 ms CSS transition | Feedback |
| Tabs | No slide (tabs switch too often); the 6 pt dot fades and scales in, 150 ms | State |
| Shopping check | The tick shows at once without waiting for the server (a failure puts it back); the circle fills in 160 ms and the check mark scales from 0.5 | Feedback |
| Shopping rows | Rows that leave the list fade out in 150 ms and the rest close the gap in 220 ms | Spatial consistency |
| Messages after an action | Fade up in 200 ms | State |
| Nutrition page | Blocks fade up once, 50 ms apart; the goal bar fills from empty on first view and eases to new values (600 ms) | Explanation |

Everything runs on the UI thread (Reanimated CSS transitions and layout animations) and is skipped under Reduce Motion.

## The Nutrition page (`/nutrition`)

Open it from **More → Nutrition** or **Health → Dashboard**. Its question: *how am I eating against my goal?*

- **Periods:** Today, 7 days, 30 days, All time, as text tabs. The page loads once (a year of daily totals, the profile, weights and the all-time summary) and switches periods without waiting.
- **The finding** sits under the title: "760 kcal left for today", "On target 4 of 6 logged days", or what is missing.
- **Blocks**, Notion-style (an icon and heading, then property rows split by hairlines):
  - **Calories:** the day's total or the average per logged day, large; a goal bar with both ends labelled (pink past the goal); columns per day (7 or 30 days) or per month (all time) with the goal as a dashed rule.
  - **Macros:** the energy split as one bar (protein 4, carbs 4, fat 9 kcal per gram), grams and share per macro, protein against its goal.
  - **Habits:** days logged, meals, streak, the day closest to the goal, fibre, sugar, sodium.
  - **Daily log:** a small table, newest first, days more than 10% off the goal in pink; 7 rows with "Show all".
  - **Health:** latest weight and its change over the period (green when it moves toward the goal, pink away from it, grey with no goal), a weight line, BMI with its band, goal, target weight, allergies and conditions, and a link to edit them.
  - **A callout** on where the numbers come from.
- **Honest numbers:** days with nothing logged are "not logged", never zero-calorie days, so averages count logged days only. All time is the server's all-time summary; the month chart covers the last 12 months (the longest range one request allows).

### Server additions

- `weightHistory(limit = 400)`: recorded weights, oldest first. Every change of weight in the profile already wrote one; nothing could read them back before.
- `nutritionOverview`: first and last logged day, days logged, meals, and averages per logged day.

### Code

- `mobile-app/src/domain/nutrition-dashboard.ts`: the maths (periods, summaries, streak, energy split, monthly averages, weight trend, BMI, round axis ticks), tested in `scripts/test-nutrition-dashboard.cjs`.
- `mobile-app/src/components/dashboard-charts.tsx`: columns and line (react-native-svg), the goal bar, the energy bar.
- `mobile-app/src/screens/nutrition-screen.tsx`: the page.

## Checks

- 464 app tests (7 new for the dashboard maths) and 173 server tests pass; typecheck and lint are clean.
- Viewed on the iOS Simulator in English light and Arabic dark. Fixed from that look: a clipped top axis label, singular forms ("1 day"), dates shown as "11-08", protein and carbs both yellow in dark mode, an unmirrored chart in Arabic, and Latin units flipping order in Arabic text (now غ، ملغ، كغ).
- Not seen on screen: the page with weeks of data and a weight line (the simulator's account has one logged day and no weights), and the haptics and sounds themselves (a simulator plays neither; they need an iPhone).
- Screenshots: `light-27-nutrition-week`, `ar-dark-11-nutrition-week`, `dark-12-settings-feel` in `Design/version-3-sip-happy/screenshots/`.

## New native packages

`expo-haptics`, `expo-audio` (configured with no microphone and no background audio) and `react-native-svg`. A new
native build is needed (`npx expo prebuild --platform ios --clean`, then build).
