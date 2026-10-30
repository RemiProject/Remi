# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

This app uses **pnpm 10.34.8 only**, pinned in `package.json`. Use
`pnpm-lock.yaml` as the sole dependency lockfile. Run the commands below from
`mobile-app/`.

On Windows, use **`pnpm.cmd`** because PowerShell's script policy blocks the
`pnpm.ps1` shim. On macOS/Linux, replace `pnpm.cmd` with `pnpm`.

## Get started

1. Install dependencies

   ```powershell
   pnpm.cmd install --frozen-lockfile
   ```

2. Start the app

   ```powershell
   pnpm.cmd exec expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Backend Kitchen reads

`EXPO_PUBLIC_BACKEND_INVENTORY` defaults to off. Only the exact value `true`
enables `createGraphqlInventoryRepository`; otherwise it returns `undefined`
without reading auth/storage or making requests. With the flag off, all existing
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

To enable it for development, set the variable before starting Expo:

```powershell
$env:EXPO_PUBLIC_BACKEND_INVENTORY="true"
pnpm.cmd exec expo start
```

On macOS/Linux: `EXPO_PUBLIC_BACKEND_INVENTORY=true pnpm exec expo start`.
Full-reload the app after changing the flag. See [Expo environment variables](https://docs.expo.dev/guides/environment-variables/).

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
