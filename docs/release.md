# Releasing Remi

What the app needs to go from this Mac to the App Store, what is already done in the code, and the steps only the
owner of the Apple and hosting accounts can take. Version 3.0.0.

## Done in the code

| Area | What is in place | Where |
|---|---|---|
| Account deletion | More → Your account → Delete account, confirmed with the password and a native alert (App Store guideline 5.1.1(v)). Removes personal and health data, devices, sessions and feedback; hands shared households to the next member; closes households only that person used | `DeleteAccountHandler`, migration `0034`, `profile-screen.tsx` |
| Privacy policy and terms | Bundled in the app (readable offline and before sign-in), linked from sign-up and More, English and Arabic | `src/data/legal.ts`, `docs/privacy-policy.md`, `docs/terms.md` |
| Permission text | Camera and photo prompts say Remi and explain receipts and food photos | `app.json` |
| Encryption answer | `ITSAppUsesNonExemptEncryption` is false (HTTPS only), so App Store Connect does not ask each build | `app.json` |
| Push notifications | The app asks only when you tap "Turn on reminders" in Notifications, then registers the device. The server sends to iOS through APNs and to Android through FCM | `push-registration.ts`, `delivery-channel.ts` |
| Offline | The account, kitchen, home, plans, shopping, recipes and Health stay readable without a connection; a strip under the status bar says Remi is offline. An expired session is no longer lost when the phone is offline | `offline-cache.ts`, `connectivity.ts`, `auth-service.ts` |
| Build profiles | `eas.json` with development, preview and production; the build number is kept by EAS | `mobile-app/eas.json` |

The privacy policy and terms text lives in `mobile-app/src/data/legal.ts`. After editing it, run
`node scripts/legal-docs.cjs` in `mobile-app` to regenerate the two documents; a test fails when they drift apart.

## 1. Host the server

The server runs on this Mac at a LAN address today. Phones outside the house cannot reach it.

1. Pick a host that runs containers next to managed Postgres 18 with pgvector (for example Fly.io, Render or a small
   VPS). The repo has `backend/Dockerfile` and `backend/docker-compose.yml` (`--profile app` runs everything).
2. Create two database roles: the migrator that owns the schema (`DATABASE_URL_MIGRATOR`) and the runtime role
   (`DATABASE_URL`, `kitchen_runtime`). Production refuses to start when they are the same.
3. Set the production environment from `backend/.env.example`. The values that must change:
   - `NODE_ENV=production`, `APP_BASE_URL` (the public HTTPS address), `CORS_ORIGINS`.
   - `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`: two long random values.
   - `EMAIL_VERIFICATION_REQUIRED=true`.
   - Object storage: `S3_*` for a real bucket (S3, R2 or similar), `S3_AUTO_CREATE_BUCKET=false`.
   - Mail and push, below.
4. Run `pnpm migrate`, then `pnpm data:import` once for the food and recipe catalogue.
5. Keep backups for no longer than 30 days: the privacy policy promises it.
6. Build the app against the public address: set `EXPO_PUBLIC_API_URL=https://…` as an EAS environment variable
   for the preview and production profiles.

## 2. Email

Mailpit catches all mail in development. For real accounts, set `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`,
`SMTP_USER`, `SMTP_PASS` and `MAIL_FROM` for a sending service (Postmark, Amazon SES, Resend or similar), and verify
the sending domain (SPF and DKIM). Password reset, verification and household invitations then reach real inboxes.

## 3. Apple account steps

These need the Apple Developer Program team that signs the app.

1. **Push Notifications:** add the capability to the App ID `com.remi.cookbook.independent`. Create an APNs key
   (Keys → +, Apple Push Notifications service), download the `.p8` once, and set `APNS_KEY_ID`, `APNS_TEAM_ID` and
   `APNS_PRIVATE_KEY` on the server. Builds signed in Xcode for a device use the sandbox (`APNS_SANDBOX=true`);
   TestFlight and App Store builds use production.
2. **App Group (share sheet):** register `group.com.remi.cookbook.independent` and add it to the App ID. Then build
   without `REMI_NO_SHARE_EXTENSION` and "Share → Remi" saves recipes from Safari and other apps.
3. A personal (free) team cannot have either capability: Xcode refuses to sign. Until the app is signed by a paid team, build with `REMI_NO_PUSH=1` and `REMI_NO_SHARE_EXTENSION=1`
   (`npx expo prebuild --platform ios --clean` after changing either). Reminders then stay inside the app and recipes
   are saved by pasting a link.
4. **Production build:** `npx eas build --platform ios --profile production`, then
   `npx eas submit --platform ios`.

## 4. App Store listing

- **Name:** Remi. **Subtitle (30):** "Your kitchen, planned and fresh". **Category:** Food & Drink.
- **Privacy policy URL:** a public copy of `docs/privacy-policy.md` (the GitHub page of the file works).
- **Support URL:** a page or address for support; set the same address as `EXPO_PUBLIC_SUPPORT_EMAIL` so Feedback &
  support shows it.
- **Age rating:** 4+. No user-to-user content beyond household members you invite.
- **Review notes:** give the reviewer a test account with a household and some food in it, and say the server is
  needed (no offline sign-up).
- **Screenshots:** 6.9" and 6.5" iPhone. The simulator screenshots in `Design/version-3-sip-happy/screenshots/` show
  the screens to capture.

### App privacy answers ("nutrition labels")

Data is linked to the user, used for app functionality only, and **not used for tracking**.

| Data type | Collected | Why |
|---|---|---|
| Contact info: name, email address, phone number | Yes | Account |
| Health & fitness: health, fitness | Yes, when entered | Allergy filters, nutrition, goals |
| User content: photos, other user content | Yes | Food and receipt photos you save, recipes, feedback |
| Identifiers: user ID, device ID (push token) | Yes | Account, notifications |
| Usage data, diagnostics, location, purchases, browsing history, contacts | No | |

If the optional embedding service (`EMBEDDING_API_URL`) is turned on, add that provider to the privacy policy's list
of service providers first: it receives catalogue and recipe text for search.

## 5. Android

The code is shared and Android builds with `npx eas build --platform android`, but nothing has been tested on an
Android device yet. Before releasing there: add `google-services.json` for FCM push, test receipt scanning (the
on-device text recognition module is iOS only, so receipts fall back to manual entry), and check the Arabic layout.

## 6. Before a large launch

- **Allergen data:** the allergen links in the food catalogue should be reviewed by a dietitian or food scientist.
- **Crash reporting:** none is installed. Sentry (`@sentry/react-native` and the NestJS SDK) is the usual choice; add
  it to the privacy answers ("Diagnostics") when you do.
- **Load:** recipe suggestions are cached per household and person for five minutes, and recomputed when the
  kitchen, recipes, catalogue or safety profile change. Measure again with real traffic.
- **Merge:** `version-3-ui` holds this work; `version-3` holds the receipt and shelf-life work and has extra Arabic
  catalogue changes in its working folder that are not committed.
