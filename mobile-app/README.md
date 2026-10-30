# Remy mobile

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

This app uses **pnpm 10.34.8 only**, pinned in `package.json`. Use
`pnpm-lock.yaml` as the sole dependency lockfile. Run the commands below from
`mobile-app/`.

On Windows, use **`pnpm.cmd`** because PowerShell's script policy blocks the
`pnpm.ps1` shim. On macOS/Linux, replace `pnpm.cmd` with `pnpm`.

## Get started

Backend inventory is **on by default**. A fresh checkout needs no mobile environment
variables: run `pnpm.cmd start` and press `w` for Expo web. The normal development
web origin is `http://localhost:8081`.

First prepare the backend in a separate terminal, following [backend setup](../backend/README.md).
The backend needs its own configured `.env` (database URL/password and JWT secrets);
"no env vars" here means no **mobile** overrides, not an unconfigured backend.
On a first checkout only, copy `backend/.env.example` to `backend/.env` and fill in
its required values; do not overwrite an existing configuration.

From `backend/` on Windows:

```powershell
pnpm.cmd install --frozen-lockfile
pnpm.cmd docker:infra
pnpm.cmd migrate
pnpm.cmd seed
pnpm.cmd seed:catalog
pnpm.cmd db:generate
pnpm.cmd start:dev
```

Keep the API (`http://localhost:3000/graphql`) and PostgreSQL/pgvector running.
Mailpit must be up for registration/verification email: SMTP port 1025, inbox
`http://localhost:8025`. `docker:infra` also starts SeaweedFS. Inventory operations
use the API/database; email setup and the catalog/reference seeds are needed for
the full new-account development walkthrough. Existing running services can be reused.

1. Install dependencies

   ```powershell
   pnpm.cmd install --frozen-lockfile
   ```

2. Start the app

   ```powershell
   pnpm.cmd start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## What changed for you

- Kitchen, Home food lists and food detail now use your signed-in household.
- Kitchen requires sign-in. It does not silently fall back to local inventory.
- Existing device items are kept unchanged, with a separate **On this device · N**
  notice. They are not imported into your account and their names are not mixed
  into the household list. The notice count belongs to the device, not the account.
- Catalog-based manual entry is available; receipt, camera and gallery methods
  show **Coming soon**.
- Web sessions are held in memory: a full page reload requires signing in again.

## Backend inventory (default)

`EXPO_PUBLIC_BACKEND_INVENTORY` is **on when unset**. Only the exact, case-sensitive
value `false` disables it; empty, `true`, `FALSE`, and other values leave it on.
With the flag off, `createGraphqlInventoryRepository` returns `undefined`
without reading auth/storage or making requests, and all existing
screens and local storage behavior stay unchanged. With the flag on, Kitchen,
Home food lists and food detail use the authenticated backend inventory.
Sign in to view a household's Kitchen. A separate **On this device** count notice
shows existing local inventory as read-only; it is never imported, edited or deleted.
Backend Edit controls and direct edit URLs remain disabled. Name search, storage filtering, name/expiry
sorting and Use First work on backend items; category filtering is unavailable
because inventory reads do not return a category.

Add food from the Add tab or the Home/Kitchen **Add food** button. Search the
catalog (including Arabic aliases), select a result, then enter a positive quantity
with up to three decimal places. Arabic digits and decimal commas are accepted.
Packs, notes and photos are not offered. Camera, gallery and receipt methods remain
disabled. Purchase date is a `YYYY-MM-DD` LocalDate; optional expiry is sent as
23:59:59 in the active household's timezone. Dates use the existing YYYY-MM-DD
form style. The app never creates catalog entries or writes these items locally.

After a timeout or network error, retry Save on the same form without edits to
reuse the exact request and idempotency key. Any field change starts a new operation.
The pending retry is held in memory while the form remains mounted; reloading the
page or leaving the form discards it. A confirmed success refreshes Kitchen and
shows **Added**. Existing local items are untouched.

On backend food detail, **Used** and **Thrown away** take an amount from the food's
soonest-expiring batches (FEFO), which may be different from the displayed batch.
The FEFO hint is always shown because this remains food-wide even with one current
batch. Units default to the displayed batch's unit; the backend converts compatible
units and reports an error when required density or piece-weight data is missing.
**Fix count** refetches this batch and adjusts by correct total minus current;
zero is a valid total and an unchanged total sends no mutation. **Added by mistake**
confirms before setting only this batch to zero. Unsupported batches remain read-only.
Successful actions refresh both the list and detail, show **Updated**, and return
to Kitchen when this batch reaches zero. A network retry keeps the same key and
payload (including an already-computed adjustment delta); editing the input starts
a new operation. If only the refresh fails after confirmed success, Retry refresh
never repeats the mutation. These retries are in memory while the dialog remains mounted.

To temporarily use the old local app for debugging, set the escape hatch before starting Expo:

```powershell
$env:EXPO_PUBLIC_BACKEND_INVENTORY="false"
pnpm.cmd start
```

On macOS/Linux: `EXPO_PUBLIC_BACKEND_INVENTORY=false pnpm start`.
To restore the default in PowerShell, use
`Remove-Item Env:EXPO_PUBLIC_BACKEND_INVENTORY -ErrorAction SilentlyContinue`, then
restart Expo and fully reload the app. An existing ignored `.env.local` can also
override the flag; remove that override when returning to the default. Never commit
local overrides. See [Expo environment variables](https://docs.expo.dev/guides/environment-variables/).

## Backend URL and failure behavior

`EXPO_PUBLIC_API_URL`, when set, is a **base URL without `/graphql`**. With no
override in development:

| Client | Detected API base URL |
| --- | --- |
| Expo web | `http://<window.location.hostname>:3000`; normally `http://localhost:3000`. Metro's port is not reused. |
| Android emulator | Metro's `Constants.expoConfig.hostUri` hostname on port 3000 if present; otherwise `http://10.0.2.2:3000`. |
| Physical phone in Expo Go/development build | Metro's LAN hostname/IP on port 3000; phone and computer must be on a reachable LAN and the firewall must allow port 3000. |

If Metro reports `localhost` for an Android emulator, it remains `localhost` and
points at the emulator itself: use `$env:EXPO_PUBLIC_API_URL="http://10.0.2.2:3000"`
in that configuration. On a physical phone, start Expo in LAN mode (the default),
or explicitly use `http://<computer-LAN-IP>:3000`; the no-host Android fallback is
for an emulator, not a physical phone. Expo tunnel hosts (`*.exp.direct`/`*.expo.dev`)
are rejected because a Metro tunnel does not expose the API. Production builds
require an explicit reachable API base URL.

The development backend automatically allows web origins `http://localhost:8081`
and `http://127.0.0.1:8081`. If Expo chooses another port, or you browse via a LAN
hostname, add that origin to the backend's `CORS_ORIGINS` and restart the API.
Native Expo Go requests are not subject to browser CORS.

A fresh signed-out app shows **Sign in to see your kitchen**, even if the API is
down. Login failures show a connection error. A signed-in Kitchen read failure
shows **Could not load your kitchen** and **Retry**, with no local fallback.
Requests time out after 12 seconds. If restoring an existing session fails due
to network/storage, Kitchen also shows error + Retry; Retry restores auth first.
A real logout/expired session shows the sign-in state and clears household rows.

## Create and verify a local test account

1. Open Kitchen → **Sign in** → **Create account**. Fill in name, username, email,
   supported mobile number, password and confirmation. Use a unique test email;
   Mailpit captures it locally, so it need not be a real mailbox.
2. Open `http://localhost:8025` and find the message to that address. Registration
   sends a **link token**, not a six-digit code. Copy the `token` query parameter
   from the verification URL; do not rely on opening the link, because its target
   `WEB_BASE_URL` may be `localhost:5173` and mobile has no `/verify-email` route.
3. At `http://localhost:3000/graphql`, run the public mutation below with the token
   in the query variables. `verifyEmail: true` confirms success.

   ```graphql
   mutation VerifyLocalEmail($token: String!) {
     verifyEmail(input: { token: $token })
   }
   ```

   Variables: `{ "token": "<token copied from Mailpit>" }`.
   If it expired, log in where the local policy permits it and call the authenticated
   `mutation { requestEmailVerification }`, then use the newest message. Otherwise
   register a new test account. Do not bypass verification in the database.
4. Sign in in the mobile app. Its first Kitchen resolution creates **My Kitchen**
   only when there are no memberships; existing households are reused.

Local backend defaults may allow an unverified account to log in
(`EMAIL_VERIFICATION_REQUIRED=false`), but verify the account for this walkthrough
and the seed script. No in-app email verification flow exists yet.

## Seed sample food

With that existing account verified, run from `backend/`:

```powershell
node scripts/seed-my-kitchen.mjs
```

Enter the email/password at the hidden prompts. The script does not log or save
credentials/tokens. For automation, inject `KITCHEN_SEED_EMAIL` and
`KITCHEN_SEED_PASSWORD` securely as environment variables; do not put passwords in
source files or shell history. It adds five catalog foods, including one expiring
today and one unsupported/read-only example. Each run adds more batches; it does
not reset existing data. Return to Kitchen or Retry to load the new batches.
If you have multiple households, use `KITCHEN_SEED_HOUSEHOLD_ID` to match the app's
selection; the script cannot read browser selection storage. See the
[seed details](../backend/README.md#seed-an-existing-accounts-kitchen-development-only).

The [acceptance checklist and current gaps](ACCEPTANCE-BACKEND-INVENTORY.md)
records automated results and the remaining human checks.

Reads use authenticated requests for the active household, fetch all inventory
pages, exclude zero balances from lists, and surface failures without local
inventory fallback. Quantities remain exact decimal strings. Unsupported unit or
storage values remain available as backend labels and make an item read-only.
Expiry dates are calendar days in the household timezone, expiring at the end of
that local day. Missing expiry stays null; unavailable notes/photos are omitted.
`get(id)` includes the transaction page (and its cursors) returned by
`inventoryItem`; it does not claim to load the complete transaction history.

## Get a fresh project

When you're ready, run:

```powershell
pnpm.cmd run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

### Other setup steps

- Add SDK-compatible packages with `pnpm.cmd exec expo install <package> --pnpm`.
- Run validation with `pnpm.cmd run typecheck`, `pnpm.cmd run lint`,
  `node --test scripts/test-*.cjs`, and `pnpm.cmd exec expo export --platform web`.

- To set up ESLint for linting, run `pnpm.cmd exec expo lint`, or follow our guide on ["Using ESLint and Prettier"](https://docs.expo.dev/guides/using-eslint/)
- If you'd like to set up unit testing, follow our guide on ["Unit Testing with Jest"](https://docs.expo.dev/develop/unit-testing/)
- Learn more about the TypeScript setup in this template in our guide on ["Using TypeScript"](https://docs.expo.dev/guides/typescript/)

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
