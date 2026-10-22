# AI Kitchen API — GraphQL Endpoints (Phases 0–7)

Endpoint: **`POST /graphql`** (default `http://localhost:3000/graphql`)

GraphQL Playground / GraphiQL is available in development at the same URL.

---

## Auth headers

| Header | When | Value |
|--------|------|--------|
| `Authorization` | Authenticated operations | `Bearer <accessToken>` |
| `x-household-id` | Household-scoped operations | UUID of the active household |

- **Public** — no auth required  
- **Auth** — `GqlAuthGuard` (valid access JWT)  
- **Household** — Auth + `x-household-id` + active membership  
- **Owner** — Household + role `OWNER`

Access tokens are short-lived JWTs (~15 min). Refresh tokens are opaque; store them client-side and use `refreshAccessToken` to rotate.

---

## Phase 4: recipes, meals, and nutrition

All operations below require `Authorization: Bearer <accessToken>` and `x-household-id`.

- Recipes: `recipes(first, after)`, `recipe(id)`, `createRecipe(input)`.
- Meals: `logMeal(input)`, `logFamilyMeal(input)`.
- Planning: `createMealPlan(input)`, `planMeal(input)`, `mealPlans(from, to)`.
- Nutrition: `dailyNutrition(from, to)` returns the authenticated user's local-day totals.

`logMeal` and `logFamilyMeal` return a union of a success (`meals`, `replayed`), `InsufficientStockType`, or (for a family share mismatch) `SharesMismatchType`. Home-origin meals consume inventory once in the same database transaction as the meal records. Family `totalServings` must equal the member and guest shares. A repeated idempotency key replays the existing result only if the payload matches.

`MealFoodInput.amount` is the quantity eaten in the selected unit. Nutrition is snapshotted when logged; missing food nutrition facts remain `null`. Meal plans use ISO dates and must be no longer than 93 days. Daily nutrition dates are computed in each user's timezone.

Example individual meal:

```graphql
mutation LogMeal($input: LogMealInputType!) {
  logMeal(input: $input) {
    ... on MealLogSuccessType { replayed meals { id mealType eatenAt items { foodName quantityG calories } } }
    ... on InsufficientStockType { available unit }
  }
}
```

Example variables:

```json
{"input":{"mealType":"LUNCH","eatenAt":"2026-10-17T11:30:00Z","origin":"HOME","idempotencyKey":"lunch-2026-10-17-001","items":[{"foodId":"<food-uuid>","amount":"150.000","unit":"GRAM"}]}}
```

## Index

### Catalog
- [`foods`](#foods) · query · public · cursor-paginated
- [`food`](#food) · query · public
- [`currencies`](#currencies) · query · public

### Inventory (Phase 3 core)
- [`inventory`](#inventory) · query · household
- [`addStock`](#addstock) · mutation · household · idempotent
- [`consumeStock`](#consumestock) · mutation · household · idempotent · FEFO

### Reference (public queries)
- [`countries`](#countries)
- [`languages`](#languages)
- [`locales`](#locales)
- [`cuisines`](#cuisines)
- [`foodCategories`](#foodcategories)

### Auth
- [`register`](#register) · mutation · public  
- [`login`](#login) · mutation · public  
- [`refreshAccessToken`](#refreshaccesstoken) · mutation · public  
- [`logout`](#logout) · mutation · auth  
- [`logoutAll`](#logoutall) · mutation · auth  
- [`verifyEmail`](#verifyemail) · mutation · public  
- [`requestPasswordReset`](#requestpasswordreset) · mutation · public  
- [`resetPassword`](#resetpassword) · mutation · public  
- [`me`](#me) · query · auth  
- [`acceptInvitation`](#acceptinvitation) · mutation · auth  

### Household
- [`createHousehold`](#createhousehold) · mutation · auth  
- [`myHouseholds`](#myhouseholds) · query · auth  
- [`householdMembers`](#householdmembers) · query · household  
- [`leaveHousehold`](#leavehousehold) · mutation · household  
- [`removeMember`](#removemember) · mutation · household  

### Invitations (OWNER only)
- [`inviteMember`](#invitemember) · mutation · owner  
- [`revokeInvitation`](#revokeinvitation) · mutation · owner  
- [`householdInvitations`](#householdinvitations) · query · owner  

---

## Reference

### `currencies`

**Query · Public**

Returns active ISO currency records for product price display.

```graphql
query {
  currencies {
    code
    name
    symbol
    decimalPlaces
  }
}
```

## Catalog

### `foods`

**Query · Public · cursor-paginated**

Searches active canonical foods by name or localized alias. Quantities and nutrition values are serialized as decimal strings.

```graphql
query {
  foods(search: "طماطم", first: 20) {
    nodes {
      id
      name
      defaultUnit
      aliases { alias languageCode isPrimary }
      nutrition { caloriesPer100g proteinG carbsG fatG fiberG sugarG sodiumMg }
    }
    hasNextPage
    endCursor
  }
}
```

Pass `endCursor` as `after` to fetch the next page.

## Inventory

All inventory operations require a valid bearer token and `x-household-id` for a household where the user is an active member. A retry must reuse the same `idempotencyKey`. Quantity values are decimal strings and are never represented as GraphQL floats.

### `inventory`

```graphql
query {
  inventory(first: 20) {
    nodes { id foodId foodName quantity unit storageLocation estimatedExpiryAt version }
    hasNextPage
    endCursor
  }
}
```

### `addStock`

Creates a new inventory batch and its `ADDED` FoodEvent and ledger transaction in one database transaction.

```graphql
mutation {
  addStock(input: {
    foodId: "019a0000-0000-7000-8000-000000000001"
    amount: "2.000"
    unit: LITER
    idempotencyKey: "add-milk-01"
    storageLocation: FRIDGE
    purchaseDate: "2026-10-17"
    estimatedExpiryAt: "2026-10-24T21:00:00.000Z"
  }) {
    ... on InventoryMutationSuccessType { eventId replayed quantity unit balances { inventoryItemId quantityDelta balanceAfter } }
    ... on InsufficientStockType { available unit }
  }
}
```

### `consumeStock`

Consumes eligible batches by earliest estimated expiry first. Batch rows are locked in stable id order before allocation. Insufficient stock returns the `InsufficientStockType` union member without writing an event or ledger row.

```graphql
mutation {
  consumeStock(input: {
    foodId: "019a0000-0000-7000-8000-000000000001"
    amount: "0.250"
    unit: LITER
    idempotencyKey: "use-milk-01"
  }) {
    ... on InventoryMutationSuccessType { eventId replayed quantity unit balances { inventoryItemId quantityDelta balanceAfter } }
    ... on InsufficientStockType { available unit }
  }
}
```

### `inventoryItem`

Returns one household-scoped batch and its append-only transaction history. History uses a stable `(createdAt, id)` cursor.

```graphql
query {
  inventoryItem(id: "019a0000-0000-7000-8000-000000000002", transactionFirst: 20) {
    id foodId foodName quantity unit storageLocation estimatedExpiryAt version
    transactions { nodes { id eventId movementType quantityDelta balanceAfter createdAt } hasNextPage endCursor }
  }
}
```

### `adjustStock`

Applies a signed correction to one batch. Negative corrections cannot reduce a batch below zero; the event and ledger row commit atomically.

```graphql
mutation {
  adjustStock(input: { inventoryItemId: "019a0000-0000-7000-8000-000000000002", delta: "-0.100", idempotencyKey: "count-correction-01" }) {
    ... on InventoryMutationSuccessType { eventId replayed quantity unit balances { inventoryItemId quantityDelta balanceAfter } }
    ... on InsufficientStockType { available unit }
  }
}
```

The daily reconciliation job compares every batch snapshot with the sum of its ledger deltas. It logs discrepancies and does not change inventory data.

### `discardStock`

Records spoiled or damaged stock as a `WASTED` event and `DAMAGE_WASTE` ledger movement, consuming batches by FEFO.

```graphql
mutation {
  discardStock(input: {
    foodId: "019a0000-0000-7000-8000-000000000001"
    amount: "0.100"
    unit: LITER
    idempotencyKey: "discard-spoiled-milk-01"
  }) {
    ... on InventoryMutationSuccessType { eventId replayed quantity unit balances { inventoryItemId quantityDelta balanceAfter } }
    ... on InsufficientStockType { available unit }
  }
}
```

## Recipes (Phase 4 start)

Recipe operations require a valid bearer token and an active `x-household-id`. The list contains shared global recipes and recipes owned by that household; private recipes from other households are excluded.

### `recipes` and `recipe`

```graphql
query {
  recipes(first: 20) { nodes { id name description servings difficulty cuisineId cuisineName } hasNextPage endCursor }
  recipe(id: "019a0000-0000-7000-8000-000000000001") {
    id name description servings difficulty
    ingredients { id foodId foodName quantity unit optional }
    steps { id stepNumber instruction durationMin }
  }
}
```

### `createRecipe`

Creates a private recipe in the active household, including its ingredients and ordered steps atomically.

```graphql
mutation {
  createRecipe(input: {
    name: "Rice and lentils"
    servings: 4
    difficulty: MEDIUM
    ingredients: [{ foodId: "019a0000-0000-7000-8000-000000000002", quantity: "300.000", unit: GRAM }]
    steps: [{ instruction: "Cook the lentils", durationMin: 20 }]
  }) {
    id name servings
    ingredients { foodId foodName quantity unit optional }
    steps { stepNumber instruction durationMin }
  }
}
```

### `food`

**Query · Public**

```graphql
query {
  food(id: "019a0000-0000-7000-8000-000000000001") {
    id
    name
    category { code name }
    defaultUnit
    gramsPerPiece
    densityGPerMl
    nutrition { caloriesPer100g proteinG carbsG fatG fiberG sugarG sodiumMg }
  }
}
```

### `countries`

**Query · Public**

```graphql
query {
  countries {
    id
    code
    name
  }
}
```

### `languages`

**Query · Public**

```graphql
query {
  languages {
    id
    code
    name
    isRtl
  }
}
```

### `locales`

**Query · Public**

```graphql
query {
  locales {
    id
    code
    name
    languageCode
  }
}
```

### `cuisines`

**Query · Public**

```graphql
query {
  cuisines {
    id
    code
    name
  }
}
```

### `foodCategories`

**Query · Public**

```graphql
query {
  foodCategories {
    id
    code
    name
  }
}
```

---

## Auth

### `register`

**Mutation · Public** · throttled

Creates a user. Returns `userId`. Email verification may be required depending on `EMAIL_VERIFICATION_REQUIRED`.

```graphql
mutation {
  register(input: {
    email: "ali@example.com"
    password: "Secret123!"
    name: "Ali"
    countryCode: "EG"
    localeCode: "ar-EG"
    timezone: "Africa/Cairo"
    languageCode: "ar"
  }) {
    userId
  }
}
```

| Field | Type | Notes |
|-------|------|--------|
| `email` | String | lowercased; unique among non-deleted users |
| `password` | String | 8–128 chars |
| `name` | String | max 100 |
| `countryCode` | String | ISO 3166-1 alpha-2 (e.g. `EG`) |
| `localeCode` | String | e.g. `ar-EG` |
| `timezone` | String | IANA (e.g. `Africa/Cairo`) |
| `languageCode` | String? | `ar` \| `en`; defaults from locale |

---

### `login`

**Mutation · Public** · throttled

Creates a **Session** (opaque refresh token hashed server-side) and returns an access JWT + refresh token pair.

```graphql
mutation {
  login(input: {
    email: "ali@example.com"
    password: "Secret123!"
  }) {
    accessToken
    refreshToken
    expiresInSeconds
  }
}
```

Client should send `User-Agent` (captured for the session row). Store both tokens; use `Authorization: Bearer <accessToken>` for protected calls.

---

### `refreshAccessToken`

**Mutation · Public** · throttled · **Session-backed rotation**

Locks the session by refresh-token hash. On success: marks old session rotated, inserts a new session in the same family, returns a **new** access + refresh pair.  
Reuse of an already-rotated token revokes the whole family (theft detection) and returns 401.

```graphql
mutation {
  refreshAccessToken(input: {
    refreshToken: "<current-opaque-refresh-token>"
  }) {
    accessToken
    refreshToken
    expiresInSeconds
  }
}
```

Always replace the stored refresh token with the new one.

---

### `logout`

**Mutation · Auth** · throttled

Revokes the session matching the given refresh token (this device) and the rest of its family.

```graphql
mutation {
  logout(input: {
    refreshToken: "<opaque-refresh-token>"
  })
}
```

Headers: `Authorization: Bearer <accessToken>`

Returns `true` (idempotent if already revoked).

---

### `logoutAll`

**Mutation · Auth**

Revokes every active session for the current user (all devices).

```graphql
mutation {
  logoutAll
}
```

Headers: `Authorization: Bearer <accessToken>`

---

### `verifyEmail`

**Mutation · Public** · throttled

Consumes a one-time email-verify token from the verification link.

```graphql
mutation {
  verifyEmail(input: {
    token: "<token-from-email-link>"
  })
}
```

---

### `requestPasswordReset`

**Mutation · Public** · throttled

Sends a password-reset email if the address exists (always returns `true` — no user enumeration).

```graphql
mutation {
  requestPasswordReset(input: {
    email: "ali@example.com"
  })
}
```

---

### `resetPassword`

**Mutation · Public** · throttled

Consumes the reset token, sets the new password, and **revokes all sessions** for that user.

```graphql
mutation {
  resetPassword(input: {
    token: "<token-from-email-link>"
    newPassword: "NewSecret123!"
  })
}
```

---

### `me`

**Query · Auth**

```graphql
query {
  me {
    id
    email
    name
    timezone
    languageCode
    emailVerifiedAt
  }
}
```

Headers: `Authorization: Bearer <accessToken>`

---

### `acceptInvitation`

**Mutation · Auth** · throttled

Accepts a household invitation. Caller must be logged in (may not be a member yet). Returns the joined `householdId`.

```graphql
mutation {
  acceptInvitation(input: {
    token: "<invitation-token-from-email>"
  })
}
```

Headers: `Authorization: Bearer <accessToken>`

---

## Household

### `createHousehold`

**Mutation · Auth**

Creates a household and makes the caller the **OWNER**. Returns the new household id.

```graphql
mutation {
  createHousehold(input: {
    name: "بيت العائلة"
    timezone: "Africa/Cairo"
  })
}
```

| Field | Type | Notes |
|-------|------|--------|
| `name` | String | required, max 100 |
| `timezone` | String? | IANA; defaults from user if omitted |

Headers: `Authorization: Bearer <accessToken>`

---

### `myHouseholds`

**Query · Auth**

Lists households the current user is an active member of.

```graphql
query {
  myHouseholds {
    role
    joinedAt
    household {
      id
      name
      timezone
    }
  }
}
```

Headers: `Authorization: Bearer <accessToken>`

---

### `householdMembers`

**Query · Household**

Lists active members of the household in the `x-household-id` header.

```graphql
query {
  householdMembers {
    userId
    name
    email
    role
    joinedAt
  }
}
```

Headers:
```
Authorization: Bearer <accessToken>
x-household-id: <household-uuid>
```

---

### `leaveHousehold`

**Mutation · Household**

Current user leaves the household in `x-household-id`. Owners cannot leave if they are the only active owner.

```graphql
mutation {
  leaveHousehold
}
```

Headers:
```
Authorization: Bearer <accessToken>
x-household-id: <household-uuid>
```

---

### `removeMember`

**Mutation · Household** (typically owner policy in handler)

Removes another member from the household.

```graphql
mutation {
  removeMember(input: {
    userId: "<member-user-uuid>"
  })
}
```

Headers:
```
Authorization: Bearer <accessToken>
x-household-id: <household-uuid>
```

---

## Invitations (OWNER)

All invitation operations require:

```
Authorization: Bearer <accessToken>
x-household-id: <household-uuid>
```

and the caller's role must be **OWNER**.

### `inviteMember`

**Mutation · Owner**

Sends an invitation email. Role is limited to `MEMBER` in MVP. Returns the invitation id.

```graphql
mutation {
  inviteMember(input: {
    email: "sara@example.com"
    role: MEMBER
  })
}
```

---

### `revokeInvitation`

**Mutation · Owner**

Revokes an open invitation.

```graphql
mutation {
  revokeInvitation(input: {
    invitationId: "<invitation-uuid>"
  })
}
```

---

### `householdInvitations`

**Query · Owner**

Lists open invitations for the household.

```graphql
query {
  householdInvitations {
    id
    email
    role
    createdAt
  }
}
```

---

## Enums

```graphql
enum HouseholdRole {
  OWNER
  MEMBER
}
```

---

## Types (return shapes)

```graphql
type AuthTokens {
  accessToken: String!
  refreshToken: String!
  expiresInSeconds: Int!
}

type RegisterResult {
  userId: ID!
}

type Me {
  id: ID!
  email: String!
  name: String!
  timezone: String!
  languageCode: String!
  emailVerifiedAt: DateTime
}

type Household {
  id: ID!
  name: String!
  timezone: String!
}

type MyHousehold {
  household: Household!
  role: HouseholdRole!
  joinedAt: DateTime!
}

type HouseholdMember {
  userId: ID!
  name: String!
  email: String!
  role: HouseholdRole!
  joinedAt: DateTime!
}

type Invitation {
  id: ID!
  email: String!
  role: HouseholdRole!
  createdAt: DateTime!
}

type Country { id: ID! code: String! name: String! }
type Language { id: ID! code: String! name: String! isRtl: Boolean! }
type Locale { id: ID! code: String! name: String! languageCode: String! }
type Cuisine { id: ID! code: String! name: String! }
type FoodCategory { id: ID! code: String! name: String! }
```

---

## Typical client flow

```text
1. countries / locales / languages   → fill registration form
2. register
3. verifyEmail (if required)
4. login                             → store accessToken + refreshToken
5. createHousehold                   → store householdId
6. myHouseholds / me                 → with Authorization
7. inviteMember / householdMembers   → Authorization + x-household-id
8. refreshAccessToken when access expires (replace both tokens)
9. logout / logoutAll when done
```

---

## HTTP (non-GraphQL)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/health/live` | Liveness |
| `GET` | `/health/ready` | Readiness (DB, etc.) |

---

## Phase 5: shopping and purchasing

All operations below require `Authorization: Bearer <accessToken>` and `x-household-id`.

- Queries: `shoppingLists`, `purchaseOrders(first, after)`.
- Shopping list mutations: `createShoppingList(input)`, `addToShoppingList(input)`, `updateShoppingList(input)` (rename/status), `updateShoppingListItem(input)`, `deleteShoppingList(id)`.
- Purchase mutations: `createPurchaseOrder(input)`, `transitionPurchaseOrder(input)`, `receivePurchaseOrderItem(input)`.
- Money values are exposed as `{ amount, currency { id, code, name, symbol, decimalPlaces } }`; each order item keeps its unit price snapshot in the order currency.

Purchase order states follow `DRAFT → PLACED → CONFIRMED → DELIVERED`, with cancellation allowed before delivery. Receipt is allowed only while `CONFIRMED`. It accepts a partial or remaining quantity, updates the order line and inventory ledger atomically, and retries with the same idempotency key do not create another inventory transaction. An order can be marked `DELIVERED` only after all its quantities have been received.

### Example: create a shopping list

```graphql
mutation CreateShoppingList($input: CreateShoppingListInputType!) {
  createShoppingList(input: $input) { id name status items { id foodName quantity unit status } }
}
```

### Example: create a purchase order

```graphql
mutation CreatePurchaseOrder($input: CreatePurchaseOrderInputType!) {
  createPurchaseOrder(input: $input) {
    id status sourceName totalCost { amount currency { code symbol } }
    items { id foodName quantity receivedQuantity unit unitPrice { amount } totalPrice { amount } }
  }
}
```

### Example: receive a partial or complete line

```graphql
mutation ReceivePurchaseOrderItem($input: ReceivePurchaseOrderItemInputType!) {
  receivePurchaseOrderItem(input: $input) {
    eventId replayed purchaseOrderId purchaseOrderStatus foodId quantity unit inventoryItemId
  }
}
```

*Generated from the active resolvers; household operations require an active membership.*

## Phase 6: personal profile and safety

These operations require `Authorization: Bearer <accessToken>` and operate only on the authenticated user's profile; they do not require `x-household-id`.

- Queries: `myProfile`, `mySafetyHistory(first, after)`, `healthConditions`.
- Mutations: `updateProfile(input)`, `setGoal(input)`, `addAllergy(input)`, `removeAllergy(input)`, `setHealthConditions(input)`, `setDietaryPreferences(input)`.
- `myProfile` returns profile, active goal, preferences, dietary choices, cuisines, dislikes, allergies, and health conditions. Health notes are decrypted only for the owner and never enter history snapshots or outbox payloads.
- `mySafetyHistory` is a keyset-paginated append-only change history. `first` defaults to 20 and accepts 1–50; pass `endCursor` as `after` for the next page.
- Any allergy match and configured dietary/health `AVOID` rule returns `FAILED`; configured limits, preferences, and dislikes return `WARNED`. Rules are data-driven; `HEALTH_CONDITION` has no hard-coded medical thresholds.
- Supplying allergy or condition notes requires `PROFILE_NOTES_KEYRING` at runtime. The value is JSON with a current `{ kid, key }` entry (32 random bytes encoded as base64url) and optional previous keys for decryption during rotation. Keep this value in the secret manager, not source control or logs.

Example:

```graphql
query MyProfile {
  myProfile {
    userId
    profile { heightCm weightKg birthDate gender activityLevel }
    goal { goalType targetWeightKg calorieTarget proteinTargetG }
    dietaryPreferences
    allergies { foodId foodName severity }
    healthConditions { healthConditionId code name status }
  }
}
```

## Phase 7: deterministic predictions

These read-only queries require `Authorization: Bearer <accessToken>` and `x-household-id` for an active household member.

- `predictions(type, first, after)` returns active typed predictions in reverse generated order. `first` defaults to 20 and accepts 1–50. `FOOD_DEPLETION` is the only implemented `PredictionType` today; other enum types return `UNSUPPORTED_PREDICTION_TYPE` until their typed workers are added.
- `stockForecast(foodId)` returns the latest unexpired depletion prediction for that food in the active household, or an empty list when none is ready.
- Inventory ledger activity queues/coalesces a background calculation with a five-minute debounce. The request path never computes predictions.
- Depletion uses the last 30 days of `CONSUMPTION` and `COOKED` ledger movements and current live inventory batches, converted to the food's default unit. `inputHash` makes identical inputs idempotent; a changed input expires the previous forecast for that food.
- Freshness scores are derived from image-backed `FreshnessPrediction` rows. `FRESHNESS_MIN_CONFIDENCE` defaults to `0.6`; samples below the threshold or past `predictedAt + remainingQualityHours` produce an unknown `NULL` score. This score is display-only.

```graphql
query Forecast($foodId: ID!) {
  stockForecast(foodId: $foodId) {
    foodId foodName currentQty unit avgDailyQty daysLeft runOutAt confidence generatedAt expiresAt
  }
  predictions(type: FOOD_DEPLETION, first: 20) {
    nodes { foodId foodName currentQty unit avgDailyQty daysLeft runOutAt }
    hasNextPage endCursor
  }
}
```

## Phase 8: safety gated supply recommendations

These operations require `Authorization: Bearer <accessToken>` and `x-household-id` for an active household member. `recommendations(type: SUPPLY_NEED, first, after)` only returns the caller's unexpired `ACTIVE` recommendations with `safetyStatus = PASSED`; drafts and blocked rows never reach the API. Accept and dismiss are terminal responses. `regenerateRecommendations(type: SUPPLY_NEED)` schedules the same five-minute outbox debounce.

```graphql
query SupplyRecommendations {
  recommendations(type: SUPPLY_NEED, first: 20) {
    nodes { id summary generatedAt expiresAt foodId foodName suggestedQty unit priority }
    pageInfo { hasNextPage endCursor }
  }
}

mutation RespondToSupplyNeed($id: ID!) {
  acceptRecommendation(id: $id)
}
```

Food depletion forecasts within 14 days create idempotent `DRAFT/PENDING` recommendations per active household member. The safety worker locks the household and member, re-reads the profile, writes all eight filter results, then moves the recommendation to `ACTIVE/PASSED` or leaves it hidden as `DRAFT/BLOCKED`. Profile changes reset open recommendations in the same transaction and enqueue rechecks. Acceptance and dismissal are folded once into the food preference score; expired recommendations are processed in batches.

## Phase 9: semantic search

`search(query, types, first)` requires an authenticated active household member. The database applies both an explicit household/user filter and a `SearchDocument` RLS policy. Foods and global recipes are shared; household recipes are visible to that household; titled meals are visible only to the user who recorded them. Results are hydrated in the same SQL query as the vector ranking and returned as the `SearchFoodResult`, `SearchRecipeResult`, or `SearchMealResult` union member, with a cosine similarity score and `safetyWarnings`. The current safety profile is locked and read in the same transaction; hard allergy/avoid conflicts are removed from results, while warning-only preferences are returned to the client. Search is rate limited to 20 calls per minute and returns at most 20 results.

The provider must be OpenAI-compatible and return 384-dimensional multilingual embeddings. Set `EMBEDDING_API_URL`, `EMBEDDING_MODEL`, and optionally `EMBEDDING_API_KEY`. E5 models receive query/passage prefixes; other models receive plain text. The worker indexes only food names/category/aliases, recipe descriptions/ingredients, or a meal's user-entered title; health and nutrition data are excluded. Once the worker has made every indexed document `READY`, run `pnpm db:search:index` to build the partial HNSW index concurrently. For local development, see the Phase 9 setup in `README.md` for the optional FastEmbed server and multilingual MiniLM model.

```graphql
query SemanticSearch($query: String!, $types: [SearchDocumentType!], $first: Int) {
  search(query: $query, types: $types, first: $first) {
    ... on SearchFoodResult { id name categoryName defaultUnit score safetyWarnings }
    ... on SearchRecipeResult { id name description score safetyWarnings }
    ... on SearchMealResult { id name eatenAt mealType score safetyWarnings }
  }
}
```

## Phase 10: notifications and devices

All notification operations require `Authorization: Bearer <accessToken>`; they are scoped to the authenticated user and do not require `x-household-id`. The inbox returns IDs and timestamps only. Clients load item or recommendation details through their existing authorized queries.

- `notifications(first, after)` returns a stable newest-first cursor page (1–50 items).
- `notificationBadge` returns the unread count; `markNotificationRead(id)` is safe to repeat.
- `myDevices` lists registered devices without exposing push tokens. `registerDevice(platform, pushToken, appVersion)` registers or refreshes the caller's token; `revokeDevice(id)` revokes it without deleting its history.
- `notificationPreferences` returns explicit preferences and defaults. Push is enabled by default; email is disabled by default. `updateNotificationPreference(type, channel, isEnabled, quietHoursStart, quietHoursEnd)` uses `HH:mm` local times, evaluated in the user's configured timezone.
- `notificationReceived` is a `graphql-ws` subscription. Connect with `connectionParams: { "authorization": "Bearer <accessToken>" }`; events contain only `notificationId` and `householdId`. Postgres `LISTEN/NOTIFY` publishes after commit for the current single-instance setup.

GraphQL requests are limited by depth (`GRAPHQL_DEPTH_LIMIT`) and estimated resolver complexity (`GRAPHQL_COMPLEXITY_LIMIT`). List selections without a bound are estimated at ten rows; variable bounds are conservatively estimated at fifty, and numeric literal `first`, `last`, `limit`, or `take` values are capped at fifty. Production deployments should keep `GRAPHQL_INTROSPECTION=false`.

Prometheus-compatible GraphQL request counters, internal-error counters, latency histograms, uptime, and process memory are exposed at `GET /health/metrics` only when `METRICS_ENABLED=true`. The endpoint requires `Authorization: Bearer <METRICS_TOKEN>` and the token must be at least 32 characters. Operation names and request contents are not used as metric labels.

An expiry sweep creates one deduped inbox notification per active household member and inventory expiry date when a nonempty item expires within three days. Recommendations that pass the existing safety gate create `RECOMMENDATION_READY` notifications in the same transaction. Delivery rows are claimed with `FOR UPDATE SKIP LOCKED`, sent outside the claim transaction, and retried with bounded backoff. Quiet hours and disabled preferences are applied by the worker. Email delivery uses the existing SMTP configuration. Push uses FCM HTTP v1; configure `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, and `FCM_PRIVATE_KEY` together. iOS devices can use FCM when APNs credentials are configured in Firebase. The private key should remain in a local secret store. No delivery is marked sent without provider confirmation. Unconfigured or unavailable providers retry up to eight attempts and then move to `FAILED`. An FCM `UNREGISTERED` response revokes that device. Run `pnpm test:integration:phase10` with a dedicated migrated `DATABASE_URL_TEST` for dedupe, disabled preferences, revocation, and worker concurrency checks.

```graphql
query MyNotifications {
  notificationBadge { unreadCount }
  notifications(first: 20) {
    nodes { id householdId type foodId inventoryItemId createdAt readAt }
    pageInfo { hasNextPage endCursor }
  }
  notificationPreferences { type channel isEnabled quietHoursStart quietHoursEnd updatedAt }
  myDevices { id platform appVersion lastSeenAt revokedAt }
}
```
