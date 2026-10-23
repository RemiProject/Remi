# Backend connection

The existing NestJS API listens on port 3000. PostgreSQL's host port 5433 is used
only by the backend; the mobile app never connects directly to the database.

`src/services/backend.ts` creates the shared fetch-based GraphQL client. No new
dependencies are needed. Open More → Settings → Check connection to make live
liveness, GraphQL, and database-backed food catalog requests from the app.
The check runs on demand and reports failures rather than assuming connectivity.

## Development URL

- Expo native development: use the hostname in `Constants.expoConfig.hostUri`
  with port 3000, so Expo Go on a phone targets the Windows machine on the LAN.
- Expo web: use the browser hostname with port 3000.
- Without a Metro host: Android defaults to `http://10.0.2.2:3000`; other
  platforms default to `http://localhost:3000`.
- Override with `EXPO_PUBLIC_API_URL` when using a different emulator, remote
  Metro host, Expo tunnel, or deployed backend. Use a base URL without `/graphql`.
  Production builds require this variable. Use HTTPS for deployed environments.

For a physical phone, keep both devices on the same network and permit inbound
TCP 3000 through Windows Firewall on your private network if necessary. Expo
tunneling exposes Metro, not the API. Set an independently reachable API URL
when using a tunnel. Native development builds must permit local HTTP traffic
if their platform transport policy restricts it; this has not been device-tested.

An optional `.env.local` can contain `EXPO_PUBLIC_API_URL=http://<Windows-LAN-IP>:3000`.
Do not copy backend secrets into Expo; EXPO_PUBLIC variables are bundled publicly.
Existing environment files were not modified. Reload the app after URL changes.

Backend development CORS includes `http://localhost:8081` and
`http://127.0.0.1:8081`. For web served on a LAN hostname or another port, append
that exact origin to the existing backend `CORS_ORIGINS` value and restart the
backend. Production uses only the configured allowlist.

## Existing integration boundaries

- Authentication exists on the backend (`register`, `login`, `refreshAccessToken`,
  `logout`, `me`). More → Profile now provides login/signup and account/session
  controls. The authentication service provides secure native token
  persistence and refresh handling; see `AUTH-SERVICE.md`. The client
  accepts a session per request and sends `Authorization: Bearer …` and optional
  `x-household-id`; it does not store credentials or automatically retry mutations.
- There is no chat operation in the current GraphQL schema. The existing chat
  placeholder remains accurate; enabling chat requires backend functionality.
- Inventory, shopping, planner, and cooking keep their existing device storage.
  Recipes remain illustrative. These screens have not been migrated to remote
  repositories: doing so requires account/household selection and explicit data
  migration and offline behavior, rather than replacing working local data.
- Receipt OCR and photo storage retain their current device/browser implementations.
- `frontend/` contains only `.gitkeep`; the active client is `mobile-app/`.

## Verification

From `mobile-app`, run `npm.cmd run typecheck`, `npm.cmd run lint`, and
`node scripts/test-backend.cjs`. To include live HTTP checks in PowerShell:

```powershell
$env:REMY_TEST_API_URL = 'http://localhost:3000'
node scripts/test-backend.cjs
```

The live test uses the same client as the app and checks health, a database-backed
catalog query, rejection of unauthenticated `me`, and Expo web CORS preflight.
It does not create users or modify application data. This verifies HTTP from the
Windows environment, not physical-device reachability or a signed-in mobile flow.
