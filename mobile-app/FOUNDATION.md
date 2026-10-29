# Remy 0.1.0

Mobile command examples use the current pnpm-only workflow (`pnpm.cmd` on Windows; `pnpm` on macOS/Linux). Recorded validation results remain historical; the commands shown are current equivalents.

Minimal Expo Router frontend foundation. No backend, AI, OCR, authentication,
inventory, or health features are implemented.

## Structure

- `src/app/_layout.tsx`: root stack, navigation theme, status bar, safe areas.
- `src/app/(tabs)/`: five tab routes and custom bottom navigation.
- `src/components/foundation-screen.tsx`: shared placeholder presentation.
- `src/theme/`: brand palette, semantic themes, typography and appearance context.
- `src/types/css.d.ts`: declarations required by preserved template CSS imports.
- `src/template-screens/`: preserved generator example screens, outside routing.
- Other generated components/hooks/assets remain preserved but are not used by Remy's shell.

## Development

```powershell
pnpm.cmd start
pnpm.cmd run typecheck
pnpm.cmd run lint
pnpm.cmd dlx expo-doctor
```

Appearance defaults to System. More provides Light/Dark/System controls for the
current session; preferences are not persisted. All feature screens explicitly
identify their placeholder state. Community and Contact Us are listed under More
without pretending their services are available.

Typography uses native system fonts temporarily. Bundle licensed Fredoka, Nunito
and Shrikhand assets and verify Arabic glyph fallbacks in a later phase. English/
Arabic translations and full RTL behavior are not implemented in 0.1.0.
Generated local Expo icons/splash assets are temporary, not final Remy branding.

The generated lockfile is retained. No force audit fixes or native project
generation should be performed as part of this foundation phase.

## Setup and validation command record

| Current pnpm command | Historical result |
| --- | --- |
| `pnpm.cmd dlx create-expo-app@latest . --template default` | Sandbox download failed with ENOTCACHED; approved network retry generated SDK 57 and installed the template. |
| `pnpm.cmd run typecheck` | Initial template CSS declaration errors fixed with `src/types/css.d.ts`; final check passed. |
| `pnpm.cmd run lint` | Sandbox network failure; approved retry installed ESLint tooling. First process failed resolving newly installed ESLint; rerun found the template hydration-hook lint error. Hook corrected; final check passed. |
| `pnpm.cmd dlx expo-doctor` | Sandbox download failed; approved retry passed 21/21 checks. |
| `pnpm.cmd audit --json` | Sandbox response reported zero findings; registry-enabled retry confirmed 29 findings (11 moderate, 18 high), exit 1. No audit fixes applied. |
| Legacy dependency-omission configuration inspection (historical only) | Empty value; no dependency omission configured. |
| `pnpm.cmd exec expo export --platform web` | Passed; five application destinations statically rendered. |
| `pnpm.cmd exec expo export --platform android --platform ios` | Initial sandbox run failed spawning Hermes (EPERM); approved retry passed both native bundles. |
| `git diff --check` | Passed; Git emitted line-ending conversion notices. |

Lint added only development dependencies: `eslint` (resolved 9.39.5) and
`eslint-config-expo` (57.0.2). No additional runtime dependencies were installed.
Install warnings include deprecated ESLint/uuid and an unapproved optional
`unrs-resolver` install script. Metro also emitted a NO_COLOR/FORCE_COLOR notice.
Physical-device and simulator UI validation has not been performed.
