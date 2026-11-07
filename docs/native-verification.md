# Version 2 verification

Validation uses the isolated local API on port 3100 and a separate PostgreSQL database. The upstream 800-food / 400-recipe CSV catalogue and eight reviewed cookbook adaptations were loaded into that database. Existing production or team data was not used.

## Automated checks

- Mobile: `pnpm typecheck`, `pnpm lint`, `node --test scripts/test-*.cjs` (418 passed with `REMY_TEST_API_URL=http://localhost:3100`, no skips), including the live API/auth/CORS check.
- Expo: `expo export --platform web` passed.
- Backend: build, lint, typecheck and 145 tests passed; migrations include `0029_cookbook_leftovers.sql`.
- `verify-recipe-suggestions.mjs`: 12 live checks passed against the current catalogue, including ranking, expired separation, safety, pagination, stale cursors and household isolation.
- `verify-connected-features.mjs`: 9 live checks passed for planning, shopping, profile/preferences, notifications, idempotent logging and versioned metadata edits.
- `verify-cookbook-intake.mjs`: 8 live checks passed for leftovers, images, feedback, retries and household isolation.
- `verify-cookbook.mjs --live`: cookbook content and repeat seeding passed without duplicate recipes, ingredients or steps.

## Native iOS

The simulator app builds successfully for iPhone 18 Pro / iOS 27.2 using Expo SDK 58 and Xcode's normal simulator signing. Native sign-in succeeded through the real login form, and the account was restored on relaunch. No plaintext fallback was added: sessions remain in SecureStore.

`CODE_SIGNING_ALLOWED=NO` caused the previous secure-storage failure because simulator entitlements were omitted. The app configuration now declares its keychain group. Xcode embeds simulated entitlements at link time; manually adding device entitlements with codesign is not equivalent.

The repeatable XCTest source and local fixture setup are in `mobile-app/verification/ios`. Run the API3100, worker and Metro8091, install the signed native build, then invoke `sh run.sh` with `REMI_SIMULATOR_ID` set. The fixture creates disposable local users and households. `credentials.json`, generated test projects, result bundles and build directories are ignored.

The signed-in XCTest workflow passed with zero failures: Home → Kitchen/search → Plan → More → ranked cookbook → full catalogue/search → recipe detail → three servings → all four backend cooking steps → ingredient confirmation with the value `3` → cancel. The confirmation review made no additional stock mutation.

A separate native appearance/localization workflow passed with zero failures: English dark settings → Arabic dark settings → Arabic light settings → English → Home. Screenshots were inspected for the final cooking step layout, serving confirmation and both language/theme variants.

## Coverage limits

No physical iPhone or Android emulator/device run, store submission, production deployment, performance benchmark, remote provider delivery or accessibility screen-reader session is claimed. Camera/OCR hardware capture and external provider setup require device/deployment verification. English/Arabic direction and state logic have automated UI coverage; native visual checks use the iOS simulator.

## Center quick-add follow-up
The native quick-add workflow passed with zero failures: centered plus → receipt review; plus → household needed-item editor; plus → multiline quick list → save Milk/Eggs/Tomatoes → relaunch → list restored. The batch-save regression test also verifies one atomic storage write, duplicate handling, invalid-line rejection and recovery after write failure. The tab tests assert center placement and action routing in English and Arabic. Typecheck, lint, the 418 mobile tests and web export passed.
