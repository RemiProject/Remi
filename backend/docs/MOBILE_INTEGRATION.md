# Mobile integration guide

Everything a client needs to talk to the API. The full contract is [`schema.graphql`](../schema.graphql) (regenerated on every dev boot); per-operation examples live in [`GRAPHQL_ENDPOINTS.md`](../GRAPHQL_ENDPOINTS.md).

## 1. Endpoints

| What | URL |
|---|---|
| Queries & mutations | `POST {API}/graphql` |
| Subscriptions | `ws(s)://{API}/graphql` (protocol `graphql-ws`) |
| Liveness / readiness | `GET {API}/health/live`, `GET {API}/health/ready` |

A phone cannot reach `localhost`. Run the API with `PORT` on `0.0.0.0` (the default) and use the machine's LAN IP, or a staging URL over HTTPS.

Generate client types from `schema.graphql` (Flutter: `graphql_codegen` / `ferry`; React Native: `@graphql-codegen/cli`). Re-run codegen whenever the file changes in git.

## 2. Authentication

1. `register` → `login` returns `{ accessToken, expiresInSeconds, refreshToken }`.
2. Send `Authorization: Bearer <accessToken>` on every request. Access tokens live `ACCESS_TOKEN_TTL_MIN` (15 min by default).
3. On `UNAUTHENTICATED`, call `refreshAccessToken(input: { refreshToken })` **once**, store **both** returned tokens, and retry the original request.
4. Refresh tokens rotate: every refresh returns a new one and invalidates the old one. Re-using an old refresh token is treated as theft and **revokes every session in that login family** → send the user to the login screen.
5. Serialize refreshes: if several requests fail at the same time, let one refresh run and make the others wait for it. Two parallel refreshes with the same token will log the user out (rule 4).
6. Store the refresh token in secure storage (Keychain / Android Keystore), never in plain preferences.
7. `logout(input: { refreshToken })` ends this device; `logoutAll` ends every device.

Email flows: `verifyEmail(token)`, `requestEmailVerification` (resend, logged-in), `requestPasswordReset(email)` (always returns `true`), `resetPassword(token, newPassword)`. Tokens arrive by email as deep links built from `WEB_BASE_URL`.

## 3. Household context

Almost every operation works inside one household.

- After login call `myHouseholds`; if empty, call `createHousehold`.
- Send the chosen id as the header **`x-household-id: <uuid>`** on every household-scoped request.
- The server checks active membership on every call. A missing/invalid header or a non-member → `FORBIDDEN`.
- Never put `householdId` in an input: the API does not accept it.

Household management: `householdMembers`, `inviteMember` / `revokeInvitation` / `householdInvitations` (OWNER), `acceptInvitation(token)`, `leaveHousehold`, `removeMember` (OWNER), `transferOwnership(newOwnerUserId)` (OWNER; the owner must transfer before leaving).

## 4. Data types

| Type | Wire format | Rule |
|---|---|---|
| `Decimal` | string, e.g. `"0.500"` | Quantities and money. **Never** send or parse as float. Up to 3 decimals for quantities. |
| `DateTime` | ISO-8601 with zone, e.g. `2026-10-22T09:30:00.000Z` | Moments in time. |
| `LocalDate` | `YYYY-MM-DD` | Nutrition / meal-plan days, in the user's timezone. |
| `ID` | UUID v7 string | |
| `Unit` | enum: `GRAM`, `KILOGRAM`, `MILLILITER`, `LITER`, `PIECE`, `CUP`, `TABLESPOON`, `TEASPOON` | Always sent together with an amount. |

## 5. Idempotency (required)

Every mutation that writes stock, meals, purchases or receipts takes `idempotencyKey: String!`.

- Generate a **new UUID when the user starts the action** (e.g. taps "Save").
- **Reuse the same key** for every retry of that action (timeout, offline queue, app restart).
- The server returns the original result for a repeated key and never applies it twice. Re-using a key with a *different* payload → `IDEMPOTENCY_KEY_REUSED`.

## 6. Results and errors

Expected business outcomes are **union results**, not errors. Always switch on `__typename`:

```graphql
mutation Consume($input: InventoryStockInput!) {
  consumeStock(input: $input) {
    __typename
    ... on InventoryMutationSuccessType { eventId replayed }
    ... on InsufficientStockType { available unit }
  }
}
```

Unions today: `InventoryMutationResult = InventoryMutationSuccessType | InsufficientStockType`, `MealLogResult = MealLogSuccessType | InsufficientStockType | SharesMismatchType`.

Everything else is a GraphQL error with a stable `extensions.code` (and `extensions.status`). Branch on the code, never on the message:

| Category | Codes |
|---|---|
| Generic | `UNAUTHENTICATED` (refresh, see §2) · `FORBIDDEN` · `NOT_FOUND` · `CONFLICT` · `UNPROCESSABLE` · `BAD_REQUEST` (input validation) · `TOO_MANY_REQUESTS` (back off) · `INTERNAL` |
| Auth | `INVALID_CREDENTIALS` · `EMAIL_NOT_VERIFIED` · `EMAIL_ALREADY_REGISTERED` · `INVALID_OR_EXPIRED_TOKEN` · `INVALID_REFRESH_TOKEN` · `INVALID_TIMEZONE` · `REFERENCE_NOT_FOUND` |
| Household | `NOT_HOUSEHOLD_MEMBER` · `NOT_HOUSEHOLD_OWNER` · `ALREADY_MEMBER` · `MEMBER_NOT_FOUND` · `CANNOT_REMOVE_OWNER` · `OWNER_CANNOT_LEAVE` · `CANNOT_TRANSFER_TO_SELF` · `INVITATION_*` |
| Inventory & units | `INSUFFICIENT_STOCK` · `INVENTORY_CONFLICT` (retry) · `INVENTORY_ITEM_NOT_FOUND` · `UNIT_NOT_CONVERTIBLE` · `UNIT_CONVERSION_UNAVAILABLE` · `INVALID_QUANTITY` · `FOOD_NOT_FOUND` |
| Idempotency | `INVALID_IDEMPOTENCY_KEY` · `IDEMPOTENCY_KEY_REUSED` |
| Meals & recipes | `SHARES_MISMATCH` · `INVALID_SHARES` · `INVALID_MEAL_ITEMS` · `DUPLICATE_MEAL_FOOD` · `RECIPE_NOT_FOUND` · `RECIPE_TOO_COMPLEX` · `MEAL_PLAN_NOT_FOUND` · `PLANNED_MEAL_NOT_FOUND` |
| Shopping | `SHOPPING_*` · `PURCHASE_ORDER_*` · `RECEIPT_EXCEEDS_ORDER` · `CURRENCY_MISMATCH` · `INVALID_MONEY` |
| Images | `UNSUPPORTED_IMAGE_TYPE` · `IMAGE_TOO_LARGE` · `IMAGE_NOT_UPLOADED` · `INVALID_IMAGE` · `IMAGE_NOT_FOUND` |
| Notifications | `INVALID_PUSH_TOKEN` · `PUSH_TOKEN_IN_USE` · `DEVICE_NOT_FOUND` · `NOTIFICATION_NOT_FOUND` · `INVALID_QUIET_HOURS` |
| Paging | `INVALID_CURSOR` · `INVALID_PAGE_SIZE` · `INVALID_DATE_RANGE` · `INVALID_DATETIME` |

`UNIT_NOT_CONVERTIBLE` means the food has no density / grams-per-piece for that unit: let the user pick the food's default unit instead.

## 7. Pagination

Lists are cursor based: pass `first` (1–50, default 20) and `after` (the previous page's `endCursor`). Stop when `hasNextPage` is false. Do not compute offsets. Cursors are opaque strings.

## 8. Image upload (two steps)

1. `requestImageUpload(input: { mimeType: "image/jpeg", sizeBytes: <exact size> })` → `{ storageKey, uploadUrl, contentType, expiresAt }`.
2. `PUT` the raw bytes to `uploadUrl` with header `Content-Type: <contentType>` (no auth header; the URL is signed and bound to that size). Do it before `expiresAt` (5 min).
3. `confirmImageUpload(input: { storageKey, type: FOOD | RECEIPT | FRESHNESS | OTHER })` → `Image { id, url, … }`. Safe to retry.

Allowed: JPEG, PNG, WebP, HEIC, up to `IMAGE_MAX_BYTES` (10 MB). The server checks the real file bytes; a renamed PDF is rejected and deleted. `Image.url` expires after a few minutes: re-query `image(id)` instead of caching the URL.

## 9. Push notifications and realtime

- On login and whenever FCM gives a new token: `registerDevice(platform: ANDROID | IOS, pushToken, appVersion)`. On logout: `revokeDevice`.
- Push payloads carry only `notificationId` and `householdId`, never health data. When opened, load details with `notifications(first, after)` and mark them with `markNotificationRead`.
- Preferences (channels, quiet hours): `updateNotificationPreference`.
- While the app is open, subscribe to `notificationReceived` over `graphql-ws`, passing `{ authorization: "Bearer <accessToken>" }` as `connectionParams`. Reconnect with a fresh token after refresh.
- The mobile app and the backend must use the same Firebase project (`FCM_*` env vars on the server).

## 10. Limits

- Rate limits per client: general `THROTTLE_LIMIT`/min, auth and upload mutations much lower. Handle `TOO_MANY_REQUESTS` with backoff.
- Query depth ≤ `GRAPHQL_DEPTH_LIMIT` and a complexity budget: request only the fields a screen needs.
- Introspection is disabled in production: use `schema.graphql` for tooling.
