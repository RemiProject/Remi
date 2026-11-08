# Running Remi on an iPhone, and what testing found

How the app is built and installed on a physical iPhone for testing against a local API, plus the results of the
stress test and the bugs it turned up. Tested on an iPhone 12 running iOS 27.0.1 and an iPhone 18 Pro simulator.

## 1. Run the API so the phone can reach it

The phone talks to the API over Wi-Fi, so the Mac and the phone must be on the same network.

```bash
cd backend
docker compose --profile app up -d db mailpit   # or: pnpm docker:infra
pnpm migrate
pnpm data:import                                # catalogue, nutrition, shelf life
pnpm build
node dist/main.js                               # http://<mac-wifi-ip>:3000/graphql
```

- **Find the Mac's Wi-Fi address:** run `ipconfig getifaddr en0`.
- **The app needs the API running.** If the terminal or session running `node dist/main.js` closes, the app on the phone gets no data.
- **Rate limits** (`backend/.env`): `THROTTLE_LIMIT=120` requests per minute per resolver per user, and `THROTTLE_AUTH_LIMIT=10`. `EMAIL_VERIFICATION_REQUIRED=false` locally, and mail goes to Mailpit.

## 2. Build and install on the phone

The API address is compiled into the app, so build with the Mac's Wi-Fi address.

```bash
cd mobile-app
EXPO_PUBLIC_API_URL=http://<mac-wifi-ip>:3000 xcodebuild -workspace ios/RemiCookbook.xcworkspace -scheme RemiCookbook \
  -configuration Release -destination 'id=<device-udid>' -derivedDataPath ios/build/device \
  DEVELOPMENT_TEAM=<team-id> CODE_SIGN_STYLE=Automatic -allowProvisioningUpdates build
xcrun devicectl device install app --device <device-udid> ios/build/device/Build/Products/Release-iphoneos/RemiCookbook.app
xcrun devicectl device process launch --device <device-udid> --terminate-existing com.remi.cookbook.independent
```

- **Find the phone's UDID:** run `xcrun devicectl list devices`. The phone must show `connected` and be unlocked to launch.
- **First install:** iOS refuses to open an app from an untrusted developer. On the phone, open Settings → General → VPN & Device Management and trust the developer, then launch again.
- **First launch:** allow Remi to find devices on the local network. Otherwise sign-in cannot reach the Mac.
- **Use Release builds.** A Debug build fails to link (`facebook::react::Sealable` undefined), because the prebuilt React Native core is the Release flavour. Release builds work on the simulator too; build for the simulator with `-destination 'id=<simulator-udid>'` and `EXPO_PUBLIC_API_URL=http://localhost:3000`.
- **Share extension:** the `version-3-ui` branch adds one, which needs an App Group the Apple team doesn't have yet. Build the phone app with `REMI_NO_SHARE_EXTENSION=1 npx expo prebuild --platform ios --clean` first (see `docs/recipe-import.md`).
- **Native modules:** after adding one (such as `modules/receipt-vision`), run `pod install` in `ios/` before building.

Creating an account on the phone is described step by step in [account-setup/](account-setup/README.md).

## 3. Stress test

The test sent 550 requests to the live API as one signed-in user, 25 at a time, covering the main read paths.

| Test group | What it called | Requests | p50 | p95 | Errors |
|---|---|---:|---:|---:|---|
| recipe | recipe detail | 150 | 24 ms | 54 ms | 30 × 429 after the first 120 in a minute |
| suggestions | `recipeSuggestions` | 100 | 1,179 ms | 1,234 ms | 0 |
| catalogue | `recipes` page | 100 | 37 ms | 546 ms | 0 |
| plans | the week's meal plan | 50 | 35 ms | 57 ms | 0 |
| foods | `foods` search | 50 | 27 ms | 55 ms | 0 |
| inventory | `inventory` page (second run) | 100 | 37 ms | 574 ms | 0 |

Findings:
- **Rate limiting works.** Each resolver allows 120 requests a minute per user, then answers `TOO_MANY_REQUESTS` (429). A real person doesn't reach it, but a client retry loop would.
- **Suggestions are the slowest call under load.** One suggestions request alone takes about 50 ms, but 25 at once take about 1.2 s each, because each one scores all 400 recipes against the kitchen. It is fine for one household; caching per household would be the first change before a large launch.
- **Request rules the test confirmed:**
  - A page holds at most 50 items, and `first: 100` is rejected.
  - Household calls need the `x-household-id` header.
- **App and backend tests** were run alongside: the backend unit tests and the app's `node --test scripts/test-*.cjs` suite.

## 4. Bugs found on the phone, and their fixes

| Found | Cause | Fix | Commit |
|---|---|---|---|
| Choosing a recipe in the planner meant scrolling all 400 | The picker listed the whole catalogue | A search field showing the chosen recipe and up to six matches | `639e004` |
| A scanned receipt added nothing to the kitchen | Each food had an "Add" pill that actually switched it to Skip. The real add button was at the bottom of a long list | Checkboxes. The add button sits under the summary. Foods with amounts are added at once | `f977405` |
| A real US receipt lost the limes, banana and onion and misread the eggs as 365 litres | Multi-buy prices, OCR reading "lb" as "1b"/"ID", tare rows, and the "365" brand read as a size | Parser fixes, with the receipt's Mac and iOS OCR output kept as test fixtures | `f977405` |
| Limes and bananas from receipts were read-only in the kitchen | Receipts suggested "Counter", which the app shows but cannot edit | Room temperature is Pantry; migration 0032 moved the receipt items | `aefe6dd` |

How the receipt bug was found:
- **API log:** the phone's requests showed two matching calls and no add call, which pointed at the review screen rather than the server.
- **On-device OCR differs from the Mac's:** for the same photo, iOS read "FOODS®" and "/ ID" where macOS read "FOODS." and "/ lb". The fix was checked against the iOS rows, logged once from the simulator.

## 5. Checks before installing

```bash
cd mobile-app && pnpm run typecheck && pnpm run lint && node --test scripts/test-*.cjs
cd backend && npx tsc --noEmit -p tsconfig.json && npx vitest run
```

Results on `version-3` at `aefe6dd`, on a clean checkout:
- **Backend:** 157 tests pass.
- **App:** 441 of 442 pass and 1 is skipped (the live-backend test).
- **Run on a clean checkout:** another session's unfinished edits in the working folder can make the app suite fail.
