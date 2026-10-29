This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

This app uses pnpm 10.34.8 only, pinned in package.json. Keep pnpm-lock.yaml as the sole dependency lockfile. On Windows, use `pnpm.cmd` because PowerShell script policy blocks the `pnpm.ps1` shim. On macOS/Linux, use `pnpm` instead.

```powershell
pnpm.cmd install --frozen-lockfile           # install the locked dependency graph
pnpm.cmd exec expo install <package> --pnpm  # ALWAYS use for SDK-compatible packages
pnpm.cmd exec expo start                     # start the dev server
pnpm.cmd run lint                            # lint
pnpm.cmd run typecheck                       # typecheck
pnpm.cmd dlx expo-doctor                     # diagnose dependency and config issues
pnpm.cmd exec expo install --fix --pnpm      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud and to ship over-the-air updates — no local Xcode or Android Studio required. Run EAS CLI as `pnpm.cmd dlx eas-cli@latest <command>` (for example, `pnpm.cmd dlx eas-cli@latest build`); substitute that for bare `eas` in docs examples. Use `pnpm` instead of `pnpm.cmd` on macOS/Linux.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a native build: `pnpm.cmd exec expo run:android` on Windows, `pnpm exec expo run:ios` on macOS, or `pnpm.cmd dlx eas-cli@latest build --profile development` for a configured EAS development profile.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md
