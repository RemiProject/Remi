# Version 2 — Living Cookbook

Version 2 continues from `main` commit `780ca6898da635c5e47017266ab6c1e2bb95a926` and brings the approved native cookbook redesign together with the latest recipe features. The `version-2` branch and **Version 2** pull request leave the original `main` available for review.

## What is included

- Paper surfaces, tomato red, butter yellow and leafy green, bundled DM Serif Display / DM Sans fonts, food photography with credits, light/dark themes and English/Arabic layouts.
- Four labeled native tabs: Home, Kitchen, Plan and More. Add food stays an explicit action in Kitchen.
- Home combines food nearing its entered expiry date, ranked backend recipe ideas, catalogue search and today's meal plan. Signed-out users see one sign-in prompt.
- Recipe suggestions retain the upstream matcher, safety filtering, cursor pagination, per-ingredient quantity/availability and separate expired-food status. The full catalogue remains available through **Browse all recipes**.
- Recipe detail adds serving scaling, shopping-list additions, meal planning, sources and image credits. Cooking uses backend steps and preserves progress. **I cooked this** opens the upstream confirmation form with the selected servings, editable ingredients, expired-stock exclusion, idempotent logging and refreshed inventory/suggestions.
- Connected planning, shopping, nutrition/preferences, household members/invitations and notification preferences. Inventory metadata edits use version checks and do not change stock quantity.
- Receipt capture/OCR with manual fallback and explicit review before saving food; household photo uploads; leftover tracking; a rules-powered kitchen helper using backend-ranked recipes; private feedback history.
- SecureStore configuration includes the iOS keychain access group. Simulator builds must retain Xcode signing and simulated entitlements; building with `CODE_SIGNING_ALLOWED=NO` strips the capabilities needed for secure sign-in.

## Run

Use the pnpm versions pinned in each package. Follow `backend/.env.example` and the backend README for local services and secrets, then run migrations (including `0029_cookbook_leftovers.sql`), reference seeding and the CSV catalogue import:

```sh
cd backend
pnpm install --frozen-lockfile
pnpm migrate
pnpm seed
pnpm data:check
pnpm data:import
pnpm build
pnpm start
# In a second terminal: pnpm start:worker
```

The repository retains the upstream development dataset: 800 foods and 400 recipes. Optional reviewed cookbook additions are separate and idempotent: `node --env-file=.env scripts/seed-cookbook.mjs`. They add eight sourced adaptations and their ingredient references without replacing the upstream catalogue.

```sh
cd mobile-app
pnpm install --frozen-lockfile
# Set EXPO_PUBLIC_API_URL to your reachable API base URL.
pnpm ios
# Android: pnpm android
```

On iOS, use the normal Xcode/Expo signing flow. Do not manually sign a simulator app with device entitlements: Xcode embeds simulator entitlements at link time. Physical-device and store builds use your own Apple provisioning configuration. Android requires its own native build for OCR.

## Verification

The checked commands and native evidence are recorded in `docs/native-verification.md`. API verifiers create disposable accounts and households; use an isolated local database. No test credentials, private environment values, generated native projects, node_modules or build outputs belong in GitHub.

## External setup still required

Email delivery, remote object storage, embeddings/LLM providers and device push delivery depend on deployment credentials and services. The kitchen helper is explicitly rules-powered. Feedback is saved privately; it does not claim an email was sent. Reminder dates are user-entered and do not certify food safety. No public social feed is claimed; that menu entry manages the household. Production rollout, Android/device QA and store submission are separate from this source update.

## Center quick-add action

The plus button between Kitchen and Plan opens receipt scanning/review, a household needed-item editor, or a freeform quick shopping list. Quick lists accept up to 50 lines, save atomically on this device, retain entries after a failed save, deduplicate unchecked items and allow check-off/removal. They are also accessible from the household Shopping screen; household catalogue items continue to sync through the existing backend. Receipt items still require review before stock is added.
