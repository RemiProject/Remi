# Nutrition rings, awards and the Remi widget

Version 3, `version-3-ui` branch. Nutrition is now a tab in place of Plan (the meal plan stays one tap away from
Home, Shopping and More → Meal plan).

## What people want from nutrition apps, and what hurts

From reviews of the popular trackers (MyFitnessPal, Lose It!, Yazio, Cronometer, MacroFactor) and reporting on
gamified nutrition apps:

- **Wanted:** a glanceable "calories left" and macro rings, ideally on the Home Screen and Lock Screen
  (Cronometer, Foodnoms and MacroTracker reviewers single this out); fast logging; goals that adapt; a clean layout.
- **Hated** (an analysis of 1-star reviews): shame mechanics, **streak anxiety**, paywall creep, a stale food
  database and subscription traps.
- **Risk:** eating-disorder clinicians and researchers warn that streaks, badges and very low calorie goals can feed
  obsessive tracking and shame (AP, June 2026). Many users still find streaks motivating.

## How Remi's game follows from that

| Decision | Why |
|---|---|
| **Fuel** closes when the day lands within 10% of the calorie goal, under or over. Eating little never closes it, and going over shows "over", not a failure | Rewards balance, not restriction |
| **Protein** closes at the protein goal (60 g without one); **Fibre** at 25 g | Two rings about eating *more* of something good |
| Without a calorie goal, Fuel counts meals (three a day) | Nobody is pushed to set a calorie number |
| The **streak** allows one rest day in any 7 | Answers "streak anxiety"; a missed day does not wipe out weeks |
| **Awards** for showing up and balance: first meal, 3/7/30-day streaks, a full-circle day, a balanced week (5 full-circle days in 7), Protein on 10 days, Fibre on 10 days, 100 meals | None rewards a low number |
| **Celebrations** fire once: the first time a ring closes today, or a new award. One haptic and chime, and a banner you can dismiss | Delight on rare moments; nothing nags |
| Copy never scolds: "2 of 3 rings closed today", "One rest day a week is on us" | No shame mechanics |

## The Nutrition tab

1. **Rings on the hero surface** (lemon in light, cobalt in dark, like Home's header): big Fuel, Protein and Fibre rings that sweep in (900 ms, staggered), the numbers
   beside them, and the last 7 days as small rings; tap a day to see it.
2. **Streak card:** the day count, the rest-day state, and awards earned.
3. **Awards:** medallions, coloured when earned, with a progress ring and "3 / 7" while not.
4. **Trends:** the existing Today / 7 days / 30 days / All time dashboard (calories against the goal, macros,
   habits, daily log, weight and health).

Code: `src/domain/nutrition-rings.ts` (rings, forgiving streak, awards; tested in `scripts/test-nutrition-rings.cjs`),
`src/components/activity-rings.tsx` (animated SVG rings and medals), `src/screens/nutrition-screen.tsx`.

## The Remi widget

`src/widgets/remi-rings.tsx`, built with Expo's `expo-widgets` (SwiftUI through `@expo/ui`):

| Size | Shows |
|---|---|
| Small | The three rings, calories left (or over), the streak |
| Medium | Rings, each ring's percentage, calories left and streak |
| Lock Screen circular | A Fuel gauge with "2/3" rings closed |
| Lock Screen rectangular | Rings closed, calories left, streak |

- Tapping the widget opens the Nutrition tab (`remi-cookbook://nutrition`).
- The app sends today's numbers to the widget whenever the Nutrition tab loads (`src/services/remi-widget.ts`).
- English and Arabic follow the app's language.

### Signing

The widget shares data through the App Group `group.com.remi.cookbook.independent`, the same one the share sheet
needs. A personal (free) Apple team cannot sign App Groups, so phone builds for that team use `REMI_NO_WIDGETS=1`
with the other switches:

```bash
REMI_NO_PUSH=1 REMI_NO_SHARE_EXTENSION=1 REMI_NO_WIDGETS=1 npx expo prebuild --platform ios --clean
```

The simulator needs no signing, so the widget runs there. Once the App Group is registered on a paid team
(`docs/release.md`), drop the switch and the widget ships to phones.

## Not done yet

- The widget refreshes when the Nutrition tab opens, not on its own. Refreshing after every logged meal, or on a
  timeline, is the next step.
- No setting yet to hide rings and awards for people who prefer plain numbers.
- Android widgets (`enableAndroid`) are not turned on.

Sources: [Unstar: calorie trackers ranked by 1-star reviews (2026)](https://unstar.app/blog/calorie-tracking-apps-ranked-1-star-reviews-2026),
[AP via ABC News: nutrition apps' gaming features carry risks (June 2026)](https://abcnews.com/Technology/wireStory/nutrition-apps-build-healthy-habits-users-gaming-features-134335903),
[Cronometer iOS widgets](https://support.cronometer.com/hc/en-us/articles/4407693442324-iOS-Home-Screen-Widgets),
[Foodnoms](https://foodnoms.com/), [Fitia: food diary apps Reddit picks (2026)](https://fitia.app/learn/article/food-diary-apps-2026-reddit-picks/),
[Expo widgets docs (SDK 58)](https://docs.expo.dev/versions/v58.0.0/sdk/widgets/).
