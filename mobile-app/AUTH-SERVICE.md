# Authentication service and UI

Mobile command examples use the current pnpm-only workflow (`pnpm.cmd` on Windows; `pnpm` on macOS/Linux). Recorded validation results remain historical; the commands shown are current equivalents.

More → Profile opens the account entry point. `/login` and `/signup` use a shared,
responsive authentication design in English and Arabic. `AuthProvider` restores the
session on launch and on app resume through `me`, using `AuthStore` for shared
account state. Other feature repositories remain local. Importing `getAuth` has
no side effects; the singleton is created on first use and storage is read lazily.

```ts
const auth = getAuth();
await auth.login({ identifier, password }); // email or username; legacy {email, password} also works
const user = await auth.me();
await auth.refreshAccessToken(); // normally automatic before me when near expiry
await auth.logout();
```

`login`, `refreshAccessToken`, and `logout` return `Promise<void>`. Tokens stay
inside the service. `me` returns `CurrentUser`: `id`, `email`, `name`, `timezone`,
`languageCode`, and nullable ISO date string `emailVerifiedAt`.
Passwords are sent only as login variables and are never stored or logged.

The operation documents match the backend's `AuthResolver`, identity inputs,
and response types. Tests validate all operation documents against `backend/schema.graphql`.
The signup form contains full name, username, email, mobile number, password and
confirmation. Username is normalized to lowercase (3–30 ASCII letters/numbers/
underscores, starts with a letter), with database-enforced uniqueness. The phone
selector supports Egypt (+20) and Saudi Arabia (+966); `auth-form.ts` owns its
extensible country list and national-format normalization. Numbers are stored
in E.164 format; this validates format, not ownership. No SMS verification is added.

`register` requires `name`, `username`, `email`, `phoneNumber` and `password`.
Confirmation is checked in the form and is never transmitted or stored. Backend
input validation and command handlers enforce 8–128 characters, an uppercase
ASCII letter, a number, and a punctuation/symbol character for new and reset
passwords. Existing passwords are not revalidated at login or changed by migration.

Locale/timezone are hidden. The frontend sends app language; the backend defaults
country from the mobile prefix, timezone to Africa/Cairo or Asia/Riyadh, and locale
to the existing ar-EG or en-US reference for the chosen language. Existing callers
may still pass explicit country, locale and timezone. New registrations now need
username and phone; legacy accounts keep email login and nullable new DB fields.
Registration shows a success message and a separate login action without creating
a session. Login errors include clear email-verification guidance. Email verification
link handling, household selection, and feature sync remain outside this change.
`/forgot-password` requests a reset email; `/reset-password?token=...` completes it
and removes the token from the current URL after success. Configure backend
`WEB_BASE_URL` to the actual hosted web origin for emailed links to reach these
routes (local Expo web commonly uses http://localhost:8081). Production also needs
working SMTP. No environment files were changed automatically.

Google and Apple buttons are explicitly disabled. There are no provider auth
operations, provider token verification, or account-linking implementation in the
backend. Enabling them needs backend provider verification/linking and registered
OAuth clients, redirect URLs, and native app identifiers, not just frontend keys.

## Migration and compatibility

`backend/prisma/migrations/0028_auth_username_phone.sql` adds nullable username and
phone columns, format checks, a unique username index, and the Saudi country
reference. It does not delete, recreate or rename existing accounts. Run the
existing `npm.cmd run migrate` and `npm.cmd run db:generate` deployment steps before
starting the updated API. They have been run against the local development DB.
Do not edit an applied migration. The API schema now requires username and phone
on new registrations, so deploy compatible clients with the API. Login retains
the deprecated `email` input as well as the new `identifier` input.

## Storage

Native platforms use SDK-compatible `expo-secure-store ~57.0.4`, installed with
Expo CLI. The session (both tokens and an absolute access expiry) is one versioned
JSON entry under `remy.auth.session.v1`; it is separate from inventory/preferences.
It is bound to the configured backend base URL to prevent sending saved tokens to
a different backend. A URL change requires an app reload and a new login.
On iOS, storage uses `WHEN_UNLOCKED_THIS_DEVICE_ONLY`. Native storage failures
are reported as `AuthError` with code `STORAGE`; there is no plaintext fallback.

The SecureStore config plugin enables Android backup exclusions and does not
request Face ID permission. No biometric prompt is enabled. SecureStore is included
in a compatible Expo Go; existing custom development builds need rebuilding to
include the new native dependency/config. No native directories were generated.
Device persistence has not been tested here. iOS Keychain entries may survive
uninstall/reinstall; server-side session validity remains authoritative.

Web uses memory only, with no localStorage, sessionStorage, or AsyncStorage token
persistence. Reloading the page loses the session. Browser persistence would need
a separately designed server-backed cookie flow, which the current API does not use.

## Lifecycle and failure behavior

- Access expiry uses `expiresInSeconds` from the server, measured conservatively
  from request start. `me` and `logout` refresh when within 30 seconds of expiry.
  There are no background timers; expiry is checked when an operation is invoked.
- Every operation and storage write is serialized to avoid rotation/logout races.
  Concurrent explicit refresh calls share a promise. Use the singleton rather
  than creating multiple services over the same storage.
- `me` retries once after `UNAUTHENTICATED` using a rotated token. Other errors
  propagate without a retry. A second authentication rejection clears the session.
- Refresh tokens are single-use. The old session is removed from memory and disk
  before refreshing. Any refresh failure, including timeout or loss of the response,
  requires login again. This avoids reusing a token that the server may have consumed.
- Logout refreshes expired access if needed because the backend guards logout.
  It always clears the local session and reports any server revocation failure.
  An offline logout cannot guarantee remote revocation. If secure deletion itself
  fails, the storage error is reported; successful on-device deletion is not assumed.
- A failed login leaves an existing session intact. A successful login replaces
  the local session; it does not revoke other server sessions.

## Checks

From `mobile-app`: `node scripts/test-auth.cjs`, `node scripts/test-auth-ui.cjs`,
`node scripts/test-auth-design.cjs`, `pnpm.cmd run typecheck`, and
`pnpm.cmd run lint`. Tests inject storage and HTTP responses into the real shared
GraphQL client; they do not create accounts, touch device storage, or use real tokens.
They cover contracts, login success/failure, restart restore, expiry, rotation,
concurrency, retry limits, logout, backend URL isolation, and storage errors.

Live development smoke checks passed for registration without automatic login,
login, current user, explicit refresh, restoration through a new service/store,
and logout back to guest state. These used a fresh disposable account and memory
storage, not device SecureStore. Passwords were generated at runtime and never
logged. On-device keyboard, navigation, native storage persistence, and verification
email delivery/link handling still need manual checks. Web sessions are memory-only.

The redesigned flow was also checked live for required username/phone registration,
server weak-password rejection, case-insensitive username conflicts, both email and
username login, Saudi country/timezone defaults, refresh/logout, and password-reset
requests. Completing reset through an emailed link is covered by mocked UI/service
tests, not a real email-link test. The disposable account remains; its session was
revoked. All 65 backend unit tests and all 14 mobile test scripts pass. Native/browser
visual inspection was unavailable in this session; responsive sizing, scroll/keyboard
configuration and password visibility controls were checked in component tests.
