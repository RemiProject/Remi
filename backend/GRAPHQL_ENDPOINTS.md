# AI Kitchen API â€” GraphQL Endpoints (Phases 0â€“7)

Endpoint: **`POST /graphql`** (default `http://localhost:3000/graphql`)

GraphQL Playground / GraphiQL is available in development at the same URL.

---

## Auth headers

| Header | When | Value |
|--------|------|--------|
| `Authorization` | Authenticated operations | `Bearer <accessToken>` |
| `x-household-id` | Household-scoped operations | UUID of the active household |

- **Public** â€” no auth required  
- **Auth** â€” `GqlAuthGuard` (valid access JWT)  
- **Household** â€” Auth + `x-household-id` + active membership  
- **Owner** â€” Household + role `OWNER`

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
- [`foods`](#foods) Â· query Â· public Â· cursor-paginated
- [`food`](#food) Â· query Â· public
- [`currencies`](#currencies) Â· query Â· public

### Inventory (Phase 3 core)
- [`inventory`](#inventory) Â· query Â· household
- [`addStock`](#addstock) Â· mutation Â· household Â· idempotent
- [`consumeStock`](#consumestock) Â· mutation Â· household Â· idempotent Â· FEFO

### Reference (public queries)
- [`countries`](#countries)
- [`languages`](#languages)
- [`locales`](#locales)
- [`cuisines`](#cuisines)
- [`foodCategories`](#foodcategories)

### Auth
- [`register`](#register) Â· mutation Â· public  
- [`login`](#login) Â· mutation Â· public  
- [`refreshAccessToken`](#refreshaccesstoken) Â· mutation Â· public  
- [`logout`](#logout) Â· mutation Â· auth  
- [`logoutAll`](#logoutall) Â· mutation Â· auth  
- [`verifyEmail`](#verifyemail) Â· mutation Â· public  
- [`requestPasswordReset`](#requestpasswordreset) Â· mutation Â· public  
- [`resetPassword`](#resetpassword) Â· mutation Â· public  
- [`me`](#me) Â· query Â· auth  
- [`acceptInvitation`](#acceptinvitation) Â· mutation Â· auth  

### Household
- [`createHousehold`](#createhousehold) Â· mutation Â· auth  
- [`myHouseholds`](#myhouseholds) Â· query Â· auth  
- [`householdMembers`](#householdmembers) Â· query Â· household  
- [`leaveHousehold`](#leavehousehold) Â· mutation Â· household  
- [`removeMember`](#removemember) Â· mutation Â· household  

### Invitations (OWNER only)
- [`inviteMember`](#invitemember) Â· mutation Â· owner  
- [`revokeInvitation`](#revokeinvitation) Â· mutation Â· owner  
- [`householdInvitations`](#householdinvitations) Â· query Â· owner  

---

## Reference

### `currencies`

**Query Â· Public**

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

**Query Â· Public Â· cursor-paginated**

Searches active canonical foods by name or localized alias. Quantities and nutrition values are serialized as decimal strings.

```graphql
query {
  foods(search: "Ø·Ù…Ø§Ø·Ù…", first: 20) {
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

**Query Â· Public**

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

**Query Â· Public**

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

**Query Â· Public**

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

**Query Â· Public**

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

**Query Â· Public**

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

**Query Â· Public**

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

**Mutation Â· Public** Â· throttled

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
| `password` | String | 8â€“128 chars |
| `name` | String | max 100 |
| `countryCode` | String | ISO 3166-1 alpha-2 (e.g. `EG`) |
| `localeCode` | String | e.g. `ar-EG` |
| `timezone` | String | IANA (e.g. `Africa/Cairo`) |
| `languageCode` | String? | `ar` \| `en`; defaults from locale |

---

### `login`

**Mutation Â· Public** Â· throttled

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

**Mutation Â· Public** Â· throttled Â· **Session-backed rotation**

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

**Mutation Â· Auth** Â· throttled

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

**Mutation Â· Auth**

Revokes every active session for the current user (all devices).

```graphql
mutation {
  logoutAll
}
```

Headers: `Authorization: Bearer <accessToken>`

---

### `verifyEmail`

**Mutation Â· Public** Â· throttled

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

**Mutation Â· Public** Â· throttled

Sends a password-reset email if the address exists (always returns `true` â€” no user enumeration).

```graphql
mutation {
  requestPasswordReset(input: {
    email: "ali@example.com"
  })
}
```

---

### `resetPassword`

**Mutation Â· Public** Â· throttled

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

**Query Â· Auth**

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

**Mutation Â· Auth** Â· throttled

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

**Mutation Â· Auth**

Creates a household and makes the caller the **OWNER**. Returns the new household id.

```graphql
mutation {
  createHousehold(input: {
    name: "Ø¨ÙŠØª Ø§Ù„Ø¹Ø§Ø¦Ù„Ø©"
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

**Query Â· Auth**

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

**Query Â· Household**

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

**Mutation Â· Household**

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

**Mutation Â· Household** (typically owner policy in handler)

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

**Mutation Â· Owner**

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

**Mutation Â· Owner**

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

**Query Â· Owner**

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
1. countries / locales / languages   â†’ fill registration form
2. register
3. verifyEmail (if required)
4. login                             â†’ store accessToken + refreshToken
5. createHousehold                   â†’ store householdId
6. myHouseholds / me                 â†’ with Authorization
7. inviteMember / householdMembers   â†’ Authorization + x-household-id
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
- Money values are exposed as `{ amount, currency { id, code, name, symbol, decimalPlaces } }`; each order item keeps nuó{h‘éì¶»§q«^t)ğ½…°ğ½µµ…¹ğ4)ğ´´µğ´´µğ4)ğ1¥¹ĞğÁ¹Á´±¥¹Ñ€ƒ
Ü…ÕÑ¼µ™¥àèÁ¹Á´±¥¹Ğé™¥á€ğ4)ğQåÁ”µ¡•¬ğÁ¹Á´ÑåÁ•¡•­€ğ4)ğU¹¥ĞÑ•ÍÑÌğÁ¹Á´Ñ•ÍÑ€ƒ
Üİ…Ñ èÁ¹Á´Ñ•ÍĞéİ…Ñ¡€ğ4)ğAÉ½‘ÕÑ¥½¸‰Õ¥±€¡ÁÉ¥Íµ„•¹•É…Ñ”€¬¹•ÍĞ‰Õ¥±€¬…±¥…ÌÉ•İÉ¥Ñ”¤ğÁ¹Á´‰Õ¥±‘€Ñ¡•¸Á¹Á´ÍÑ…ÉÑ€ğ4(4(ŒŒŒM1¥¹ĞÉÕ±•Ìİ½ÉÑ ­¹½İ¥¹œ4(¨%µÁ½ÉÑÌµÕÍĞÕÍ”Ñ¡” ½€…±¥…Ì€¡ ½Á±…Ñ™½É´¼¸¸¹€¤°¹•Ù•È€¸¸½€¸4(¨‘½µ…¥¸½€¥ÌÁÕÉ”QåÁ•MÉ¥ÁĞè¹¼9•ÍĞÉÕ¹Ñ¥µ”°AÉ¥Íµ„°]L°M5Q@°…¹¹¼½ÕÑ•È±…å•ÉÌ€¡ÑåÁ”µ½¹±ä¥µÁ½ÉÑÌ…É”…±±½İ•¤¸4(¨…ÁÁ±¥…Ñ¥½¸½€¹•Ù•È¥µÁ½ÉÑÌAÉ¥Íµ„½]L½M5Q@½É…Á¡E0½È¥¹™É…ÍÑÉÕÑÕÉ”½€½ÁÉ•Í•¹Ñ…Ñ¥½¸½€¸4(¨ÁÉ•Í•¹Ñ…Ñ¥½¸½€€¡É•Í½±Ù•ÉÌ¤¹•Ù•È¥µÁ½ÉÑÌÉ•Á½Í¥Ñ½É¥•Ì½ÈAÉ¥Íµ„ì¥Ğ½¹±äÕÍ•Ì½µµ…¹‘	ÕÍ€½EÕ•Éå	ÕÍ€¸4(¨µ½‘Õ±”¹•Ù•È¥µÁ½ÉÑÌ…¹½Ñ¡•Èµ½‘Õ±”Ì¥¹™É…ÍÑÉÕÑÕÉ”½€°‘½µ…¥¸½€½ÈÁÉ•Í•¹Ñ…Ñ¥½¸½€¸4(4(ŒŒEIL±…å½ÕĞ€¡Á•Èµ½‘Õ±”¤4)€4)µ½‘Õ±•Ì¼ñ¹…µ”ø¼4(€‘½µ…¥¸¼€€€€€€€•¹Ñ¥Ñ¥•Ìƒ
Ü•Ù•¹ÑÌƒ
ÜÁ½ÉÑÌ€¡É•Á½Í¥Ñ½É¥•Ì½…‘…ÁÑ•ÉÌ¤ƒ
ÜÁÕÉ”ÉÕ±•Ìƒ
Ü•ÉÉ½ÉÌ4(€…ÁÁ±¥…Ñ¥½¸¼4(€€€½µµ…¹‘Ì¼ñÕÍ”µ…Í”ø¼€à¹½µµ…¹¹ÑÌ€¬à¹¡…¹‘±•È¹ÑÌ€€€¡İÉ¥Ñ•ÌèQ`€¬½ÕÑ‰½à°Ñ¡•¸Ù•¹Ñ	ÕÌ¹ÁÕ‰±¥Í ¤4(€€€ÅÕ•É¥•Ì¼ñÕÍ”µ…Í”ø¼€€à¹ÅÕ•Éä¹ÑÌ€€€¬à¹¡…¹‘±•È¹ÑÌ€€€¡É•…‘Ì½¹±ä°¹¼Q`¤4(€€€€¨¹•Ù•¹ÑÌµ¡…¹‘±•È¹ÑÌ€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€¡¥¸µÁÉ½•ÍÌÉ•…Ñ¥½¹ÌÑ¼‘½µ…¥¸•Ù•¹ÑÌ¤4(€¥¹™É…ÍÑÉÕÑÕÉ”¼ÁÉ¥Íµ„É•Á½Í¥Ñ½É¥•Ìƒ
Ü…‘…ÁÑ•ÉÌ€¡…É½¸È°©İĞ¤ƒ
Ü½ÕÑ‰½à¡…¹‘±•ÉÌ€¡•µ…¥±Ì¤4(€ÁÉ•Í•¹Ñ…Ñ¥½¸¼€€É•Í½±Ù•ÉÌ€¡½¹±ä½µµ…¹‘	ÕÌ½EÕ•Éå	ÕÌ¤ƒ
Ü¥¹ÁÕÑÌ€¡±…ÍÌµÙ…±¥‘…Ñ½È¤ƒ
ÜÉ…Á¡E0ÑåÁ•Ì4)€4(¨½µµ…¹€ô¥¹Ñ•¹ĞÑ¡…Ğ¡…¹•ÌÍÑ…Ñ”¸EÕ•Éä€ôÉ•…¸Ù•¹Ğ€ôÍ½µ•Ñ¡¥¹œ¡…ÁÁ•¹•€¡ÁÕ‰±¥Í¡•QH½µµ¥Ğ¤¸4(¨Õ…É…¹Ñ••Í¥‘”•™™•ÑÌ€¡•µ…¥±Ì¤¼Ñ¡É½Õ Ñ¡”€¨©½ÕÑ‰½à¨¨€¡Í…µ”Q`…ÌÑ¡”İÉ¥Ñ”¤°¹½ĞÑ¡É½Õ •Ù•¹ÑÌ¸4(¨É½ÍÌµµ½‘Õ±”…±±Ì¼Ñ¡É½Õ Ñ¡”‰ÕÍ•Ì€¡I•Í½±Ù•I•¥ÍÑÉ…Ñ¥½¹I•™•É•¹•ÍEÕ•Éå€°•ÑÑ¥Ù•5•µ‰•ÉÍ¡¥ÁEÕ•Éå€¤°¹•Ù•È‰ä¥µÁ½ÉÑ¥¹œ…¹½Ñ¡•Èµ½‘Õ±”ÌÉ•Á½Í¥Ñ½É¥•Ì¸4(4(ŒŒŒ‘„™•…ÑÕÉ”4(Ä¸…ÁÁ±¥…Ñ¥½¸½½µµ…¹‘Ì½µäµÑ¡¥¹œ½µäµÑ¡¥¹œ¹½µµ…¹¹ÑÍ€€¡•áÑ•¹‘Ì½µµ…¹ñI•ÍÕ±Ğù€¤…¹€¹¡…¹‘±•È¹ÑÍ€€¡½µµ…¹‘!…¹‘±•É€¤¸4(È¸I•¥ÍÑ•ÈÑ¡”¡…¹‘±•È¥¸Ñ¡”µ½‘Õ±”ÌÁÉ½Ù¥‘•ÉÍ€¸4(Ì¸‘„É•Í½±Ù•Èµ•Ñ¡½Ñ¡…Ğ‘½•Ì½µµ…¹‘	ÕÌ¹•á•ÕÑ”¡¹•Ü5åQ¡¥¹½µµ…¹ ¸¸¸¤¥€¸4(Ğ¸áÑÉ„É•…Ñ¥½¸ü‘…¸Ù•¹ÑÍ!…¹‘±•É€€¡‰•ÍĞ•™™½ÉĞ¤½È…¸½ÕÑ‰½àÑ½Á¥Œ€¬=ÕÑ‰½á!…¹‘±•È¡Ñ½Á¥Œ¥€€¡Õ…É…¹Ñ••¤¸4(4(ŒŒA¡…Í”€À€¡Á±…Ñ™½É´¤4)½¹™¥œ€¡é½¤ƒ
Ü‘ˆ€¡AÉ¥Íµ„…‘…ÁÑ•ÈµÁœ°QÉ…¹Í…Ñ¥½¹IÕ¹¹•É€İ¥Ñ €ĞÀÀÀÄ¼ĞÁ@ÀÄÉ•ÑÉä€¬…ÁÀ¹ÕÍ•É}¥½…ÁÀ¹¡½ÕÍ•¡½±‘}¥‘€¤ƒ
Ü½ÕÑ‰½à€¡ÁÕ‰±¥Í¡•È°Á½±±•Èİ¥Ñ M-%@1=-€¬±•…Í”€¬‰…­½™˜€¬‘•…±•ÑÑ•È°=ÕÑ‰½á!…¹‘±•É€¤ƒ
ÜÑ•¹…¹ä€¡)]P°¡½ÕÍ•¡½±Õ…É°É½±•Ì¤ƒ
ÜÉ…Á¡Å°€¡Í…±…ÉÌ°‘•ÁÑ ±¥µ¥Ğ°•ÉÉ½Èµ…ÁÁ•È°Ñ¡É½ÑÑ±•È¤ƒ
Üµ…¥°€¡¡…¹‘±•‰…ÉÌ…È½•¸¤ƒ
ÜÍÑ½É…”€¡LÌÁÉ•Í¥¸¤ƒ
Ü¡•…±Ñ ƒ
Ü½­•È¸4(4(ŒŒA¡…Í”€Ä€¡¥‘•¹Ñ¥Ñä¤4)Q…‰±•Ìè½Õ¹ÑÉä°1…¹Õ…”°1½…±”°Õ¥Í¥¹”°½½‘…Ñ•½Éä°UÍ•È°!½ÕÍ•¡½±°!½ÕÍ•¡½±‘5•µ‰•È°!½ÕÍ•¡½±‘%¹Ù¥Ñ…Ñ¥½¸°Q½­•¸°M•ÍÍ¥½¸¸4)½µµ…¹‘ÌèÉ•¥ÍÑ•È°±½¥¸°É•™É•Í¡•ÍÍQ½­•¸°Ù•É¥™åµ…¥°°É•ÅÕ•ÍÑA…ÍÍİ½É‘I•Í•Ğ°É•Í•ÑA…ÍÍİ½É°É•…Ñ•!½ÕÍ•¡½±°¥¹Ù¥Ñ•5•µ‰•È°…•ÁÑ%¹Ù¥Ñ…Ñ¥½¸°É•Ù½­•%¹Ù¥Ñ…Ñ¥½¸°É•µ½Ù•5•µ‰•È°±•…Ù•!½ÕÍ•¡½±¸4)EÕ•É¥•Ìèµ”°µå!½ÕÍ•¡½±‘Ì°¡½ÕÍ•¡½±‘5•µ‰•ÉÌ°¡½ÕÍ•¡½±‘%¹Ù¥Ñ…Ñ¥½¹Ì°½Õ¹ÑÉ¥•Ì½±…¹Õ…•Ì½±½…±•Ì½Õ¥Í¥¹•Ì½™½½‘…Ñ•½É¥•Ì¸4(4)!½ÕÍ•¡½±µÍ½Á•½Á•É…Ñ¥½¹Ì¹••¡•…‘•ÉÌÕÑ¡½É¥é…Ñ¥½¸è	•…É•È€ñ…•ÍÌù€…¹àµ¡½ÕÍ•¡½±µ¥è€ñÕÕ¥ù€¸4(4(ŒŒA¡…Í”€È€¡…Ñ…±½œ¤4)Q…‰±•ÌèÕÉÉ•¹ä°½½°½½‘±¥…Ì°9ÕÑÉ¥Ñ¥½¹AÉ½™¥±”°½½‘MÕ‰ÍÑ¥ÑÕÑ¥½¸°AÉ½‘ÕĞ°AÉ½‘ÕÑM½ÕÉ”¸Q¡”™½½‘Ì¡Í•…É °™¥ÉÍĞ°…™Ñ•È¥€ÅÕ•ÉäÍ•…É¡•Ì…¹½¹¥…°¹…µ•Ì…¹±½…±¥é•…±¥…Í•Ìİ¥Ñ …¸%ÕÉÍ½È¸U¹¥Ñ½¹Ù•ÉÑ•É€ÕÍ•Ì•á…Ğ‘•¥µ…°…É¥Ñ¡µ•Ñ¥Œ°Ñ¡”Ù•ÉÍ¥½¹•ÕÀ½Ñ…‰±•ÍÁ½½¸½¹ÍÑ…¹ÑÌ°…¹¡…±˜µÕÀÉ½Õ¹‘¥¹œÑ¼Ñ¡É•”‘•¥µ…°Á±…•Ì¸Á¹Á´Í••é…Ñ…±½€±½…‘Ì„ÍÑ…ÉÑ•È±¥ÍĞì¹ÕÑÉ¥Ñ¥½¸Ù…±Õ•Ì…É”¥¹Ñ•¹Ñ¥½¹…±±ä±•™Ğ•µÁÑäÕ¹Ñ¥°„ÑÉÕÍÑ•Í½ÕÉ”¥ÌÍ•±•Ñ•¸4(4(ŒŒA¡…Í”€Ì€¡¥¹Ù•¹Ñ½Éä±•‘•È¤4)5¥É…Ñ¥½¹Ì€ÀÀÀÙ}¥¹Ù•¹Ñ½Éä¹ÍÅ±€…¹€ÀÀÀİ}¥¹Ù•¹Ñ½Éå}¥¹Ñ•É¥Ñä¹ÍÅ±€…‘¥¹Ù•¹Ñ½Éä‰…Ñ¡•Ì°…ÕÍ…°™½½•Ù•¹ÑÌ°…¹…ÁÁ•¹µ½¹±äÑÉ…¹Í…Ñ¥½¹Ìİ¥Ñ ¡½ÕÍ•¡½±­•åÌ°I1LÁ½±¥¥•Ì°‘•™•ÉÉ••Ù•¹ĞµÑ¼µ±•‘•È¡•­Ì°™½½½¥Ñ•´½¹Í¥ÍÑ•¹ä°…¹‘…Ñ…‰…Í”Õ…É‘Ì™½ÈÅÕ…¹Ñ¥Ñä•‘¥ÑÌ¸Q¡”…ÕÑ¡•¹Ñ¥…Ñ•¡½ÕÍ•¡½±A$ÁÉ½Ù¥‘•ÌÁ…•¥¹Ù•¹Ñ½Éå€°¥¹Ù•¹Ñ½Éå%Ñ•µ€İ¥Ñ Á…•ÑÉ…¹Í…Ñ¥½¸¡¥ÍÑ½Éä°…‘‘MÑ½­€°<µ½É‘•É•½¹ÍÕµ•MÑ½­€°…¹…‘©ÕÍÑMÑ½­€¸I•Á•…Ñ•¥‘•µÁ½Ñ•¹ä­•åÌÉ•Á±…äÑ¡”½É¥¥¹…°É•ÍÕ±Ğ½¹±äİ¡•¸Ñ¡”É•ÅÕ•ÍĞµ…Ñ¡•Ì¸Q¡”Í•ÉÙ¥”…±Í¼•áÁ½Í•ÌÁÕÉ¡…Í”É••¥ÁĞ…¹‘¥Í…É½Á•É…Ñ¥½¹Ì™½È±…Ñ•Èİ½É­™±½İÌ¸‘…¥±äÉ•½¹¥±¥…Ñ¥½¸¡•­ÌÍ¹…ÁÍ¡½ĞÅÕ…¹Ñ¥Ñ¥•Ì……¥¹ÍĞ±•‘•ÈÍÕµÌ°±½Ì‘¥ÍÉ•Á…¹¥•Ì°…¹¹•Ù•ÈÉ•Á…¥ÉÌ‘…Ñ„…ÕÑ½µ…Ñ¥…±±ä¸M•”IA!E1}9A=%9QL¹µ‘€¸4(4(ŒŒA¡…Í”€Ğ€¡É•¥Á•Ì°µ•…±Ì°…¹‘…¥±ä¹ÕÑÉ¥Ñ¥½¸°½µÁ±•Ñ”¤4)5¥É…Ñ¥½¹Ì€ÀÀÀá}É•¥Á•Ì¹ÍÅ±€…¹€ÀÀÀå}µ•…±Ì¹ÍÅ±€ÁÉ½Ù¥‘”±½‰…°½È¡½ÕÍ•¡½±µÁÉ¥Ù…Ñ”É•¥Á•Ì°¥¹É•‘¥•¹ÑÌ°½É‘•É•ÍÑ•ÁÌ°µ•…°Á±…¹Ì°Á±…¹¹•µ•…±Ì°¥¹‘¥Ù¥‘Õ…°…¹™…µ¥±äµ•…°±½Ì°µ•…°µÑ¥µ”¹ÕÑÉ¥Ñ¥½¸Í¹…ÁÍ¡½ÑÌ°…¹Á•ÈµÕÍ•È‘…¥±ä¹ÕÑÉ¥Ñ¥½¸ÍÕµµ…É¥•Ì¸I•¥Á”Í½Á”…¹¡½ÕÍ•¡½±µ•µ‰•ÉÍ¡¥À…É”•¹™½É•‰ä‘…Ñ…‰…Í”Õ…É‘Ì…¹I1L¸1½¥¹œ„¡½µ”µ•…°½¹ÍÕµ•ÌÍÑ½¬Ñ¡É½Õ Ñ¡”¥¹Ù•¹Ñ½Éä±•‘•È¥¸Ñ¡”Í…µ”ÑÉ…¹Í…Ñ¥½¸ì„™…µ¥±äµ•…°½¹ÍÕµ•Ì¥Ğ½¹”°É•…Ñ•Ì„µ•…°Á•È…Ñ¥Ù”µ•µ‰•È°…¹…±±½…Ñ•Ì™½½ÅÕ…¹Ñ¥Ñ¥•Ì•á…Ñ±ä…É½ÍÌµ•µ‰•È…¹Õ•ÍĞÍ•ÉÙ¥¹Ì¸Õ•ÍÑÌ…É”¹½Ğ…ÍÍ¥¹•µ•…±Ì½È¹ÕÑÉ¥Ñ¥½¸¸%‘•µÁ½Ñ•¹ä­•åÌÁÉ•Ù•¹Ğ‘ÕÁ±¥…Ñ”½Á•É…Ñ¥½¹Ì°…¹‘…¥±äÍÕµµ…É¥•ÌÕÍ”•… ÕÍ•ÈÌÑ¥µ•é½¹”¸É…Á¡E0ÁÉ½Ù¥‘•ÌÉ•¥Á”°µ•…°±½¥¹œ°µ•…°Á±…¸°…¹‘…¥±ä¹ÕÑÉ¥Ñ¥½¸½Á•É…Ñ¥½¹Ì¸M•”IA!E1}9A=%9QL¹µ‘€¸4(4(ŒŒA¡…Í”€Ô€¡Í¡½ÁÁ¥¹œ…¹ÁÕÉ¡…Í¥¹œ°½µÁ±•Ñ”¤4)5¥É…Ñ¥½¸€ÀÀÄÁ}½µµ•É”¹ÍÅ±€…‘‘Ì¡½ÕÍ•¡½±µÍ½Á•Í¡½ÁÁ¥¹œ±¥ÍÑÌ…¹¥Ñ•µÌ°ÁÕÉ¡…Í”½É‘•ÉÌİ¥Ñ ÕÉÉ•¹ä…¹ÁÉ¥”Í¹…ÁÍ¡½ÑÌ°•¹•É…Ñ•±¥¹”Ñ½Ñ…±Ìİ¥Ñ „‘•™•ÉÉ•½É‘•ÈµÑ½Ñ…°Õ…É°…¹„ÁÕÉ¡…Í”µ½É‘•ÈÍÑ…Ñ”Õ…É¸É…Á¡E0¥¹±Õ‘•ÌÍ¡½ÁÁ¥¹œ±¥ÍĞIU°ÁÕÉ¡…Í•=É‘•ÉÍ€°É•…Ñ•AÕÉ¡…Í•=É‘•É€°ÑÉ…¹Í¥Ñ¥½¹AÕÉ¡…Í•=É‘•É€°…¹É••¥Ù•AÕÉ¡…Í•=É‘•É%Ñ•µ€¸I••¥ÁÑÌ¼Ñ¡É½Õ %¹Ù•¹Ñ½Éå1•‘•ÉM•ÉÙ¥•€¥¸Ñ¡”Í…µ”ÑÉ…¹Í…Ñ¥½¸…ÌÉ••¥Ù•µÅÕ…¹Ñ¥ÑäÕÁ‘…Ñ•Ì°ÍÕÁÁ½ÉĞÁ…ÉÑ¥…°É••¥ÁÑÌ°…¹ÕÍ”½¹”AUI!M€•Ù•¹ĞÁ•È½É‘•È¥Ñ•´Á±ÕÌÉ•ÅÕ•ÍĞ¥‘•µÁ½Ñ•¹ä­•åÌ™½ÈÉ•ÑÉäÍ…™•Ñä¸¹Á´ÉÕ¸Ñ•ÍĞé¥¹Ñ•É…Ñ¥½¸éÁ¡…Í”Õ€Ù•É¥™¥•ÌÍ¡½ÁÁ¥¹œ±¥ÍĞIU°ÕÉÉ•¹äÍ¹…ÁÍ¡½ÑÌ°Á…ÉÑ¥…°Ñ¡•¸™Õ±°É••¥ÁĞ°É•ÑÉä¥‘•µÁ½Ñ•¹ä°…¹Í¥µÕ±Ñ…¹•½ÕÌ‘ÕÁ±¥…Ñ”É••¥ÁĞ¸M•”IA!E1}9A=%9QL¹µ‘€¸4(4(ŒŒA¡…Í”€Ø€¡Á•ÉÍ½¹…°ÁÉ½™¥±”…¹Í…™•Ñä°½µÁ±•Ñ”¤4)5¥É…Ñ¥½¸€ÀÀÄÅ}ÁÉ½™¥±•}Í…™•Ñä¹ÍÅ±€…‘‘ÌÁ•ÉÍ½¹…°ÁÉ½™¥±•Ì…¹İ•¥¡Ğ¡¥ÍÑ½Éä°½…±Ì°ÁÉ•™•É•¹•Ì°…±±•É¥•Ì°¡•…±Ñ ½¹‘¥Ñ¥½¹Ì°‘¥•Ñ…ÉäÉÕ±•Ì°…¹…ÁÁ•¹µ½¹±äÍ…™•Ñä¡¥ÍÑ½Éä¸Q¡”…ÕÑ¡•¹Ñ¥…Ñ•Í•±˜µ½¹±äÉ…Á¡E0A$•áÁ½Í•ÌµåAÉ½™¥±•€°µåM…™•Ñå!¥ÍÑ½Éå€°¡•…±Ñ¡½¹‘¥Ñ¥½¹Í€°ÕÁ‘…Ñ•AÉ½™¥±•€°Í•Ñ½…±€°…‘‘±±•Éå€°É•µ½Ù•±±•Éå€°Í•Ñ!•…±Ñ¡½¹‘¥Ñ¥½¹Í€°…¹Í•Ñ¥•Ñ…ÉåAÉ•™•É•¹•Í€¸ÁÕÉ”M…™•ÑåÙ…±Õ…Ñ½É€É•ÑÕÉ¹Ì…±°•¥¡ĞÍ…™•Ñä™¥±Ñ•ÉÌì…±±•Éä…¹½¹™¥ÕÉ•Y=%€ÉÕ±•Ì™…¥°±½Í•°İ¡¥±”±¥µ¥ÑÌ°ÁÉ•™•É•¹•Ì°…¹‘¥Í±¥­•Ìİ…É¸¸MÑ…Ñ•µ•¹Ğµ±•Ù•°ÑÉ¥•ÉÌÉ•½ÉÍ…™•Ñä¡…¹•Ì…¹‘•‘ÕÁ±¥…Ñ”Ñ¡”½ÕÑ‰½à•Ù•¹ĞÁ•ÈÕÍ•È…¹ÑÉ…¹Í…Ñ¥½¸ìI1LÉ•ÍÑÉ¥ÑÌÁ•ÉÍ½¹…°É½İÌÑ¼Ñ¡•¥È½İ¹•È¸±±•Éä…¹¡•…±Ñ ¹½Ñ•ÌÕÍ”L´ÈÔØµ4İ¥Ñ É½Üµ‰½Õ¹…¹É•ÅÕ¥É”AI=%1}9=QM}-eI%9€Ñ¼‰”¥¹©•Ñ•‰äÑ¡”ÉÕ¹Ñ¥µ”Í•É•Ğµ…¹…•È¸½¹™¥ÕÉ”¥Ğ…Ì)M=8Í¡…Á•±¥­”ì‰ÕÉÉ•¹Ğˆéì‰­¥ˆè‰­•ä´ÈÀÈØ´ÀÄˆ°‰­•äˆèˆñ‰…Í”ØÑÕÉ°µ•¹½‘•´ÌÈµ‰åÑ”µ­•äø‰ô°‰ÁÉ•Ù¥½ÕÌˆémuõ€ìÉ•Ñ…¥¸ÁÉ•Ù¥½ÕÌ­•åÌ‘ÕÉ¥¹œÉ½Ñ…Ñ¥½¸¸M••‘•‘¥•Ñ…ÉäÉÕ±•Ì…¹½¹‘¥Ñ¥½¸…Ñ…±½œ•¹ÑÉ¥•Ì…É”ÍÑ…ÉÑ•ÈÉ•™•É•¹”‘…Ñ„ì¹¼±¥¹¥…°¹ÕÑÉ¥•¹ĞÑ¡É•Í¡½±‘Ì½È!…±…°•ÉÑ¥™¥…Ñ¥½¸±…¥µÌ…É”Í••‘•¸¹Á´ÉÕ¸Ñ•ÍĞé¥¹Ñ•É…Ñ¥½¸éÁ¡…Í”Ù€Ù•É¥™¥•ÌÑÉ¥•È‰…Ñ¡¥¹œ½‘•‘ÕÁ±¥…Ñ¥½¸°…ÁÁ•¹µ½¹±ä¡¥ÍÑ½Éä°•¹ÉåÁÑ¥½¸°…¹½İ¹•Èµ½¹±äI1L¸M•”IA!E1}9A=%9QL¹µ‘€¸4(4(ŒŒA¡…Í”€Ü€¡‘•Ñ•Éµ¥¹¥ÍÑ¥Œ…¹…±åÑ¥Ì…¹ÁÉ•‘¥Ñ¥½¹Ì°™¥ÉÍĞ•¹µÑ¼µ•¹ÑåÁ”¤4)5¥É…Ñ¥½¹Ì€ÀÀÄÉ}ÁÉ•‘¥Ñ¥½¹Ì¹ÍÅ±€…¹€ÀÀÄÍ}ÁÉ•‘¥Ñ¥½¹}‘•Ñ…¥±}Õ…É¹ÍÅ±€…‘¹ÕÑÉ¥Ñ¥½¸ÑÉ•¹ÍÑ½É…”°¥µ…”µ•Ñ…‘…Ñ„°™É•Í¡¹•ÍÌÍ…µÁ±•Ì°…¹Ñ¡”ÑåÁ•ÁÉ•‘¥Ñ¥½¸‰…Í”Á±ÕÌ==}A1Q%=9€‘•Ñ…¥°¸%¹Ù•¹Ñ½Éä±•‘•ÈİÉ¥Ñ•Ì½…±•Í”„¡½ÕÍ•¡½±ÁÉ•‘¥Ñ¥½¸•Ù•¹Ğ™½È™¥Ù”µ¥¹ÕÑ•ÌìÑ¡”½ÕÑ‰½àİ½É­•ÈÕÍ•Ì„Á•Èµ¡½ÕÍ•¡½±…‘Ù¥Í½Éä±½¬°¡…Í¡•Ì…¹½¹¥…°ÍÑ½¬½½¹ÍÕµÁÑ¥½¸¥¹ÁÕÑÌ°½¹Ù•ÉÑÌÅÕ…¹Ñ¥Ñ¥•ÌÑ¼•… ™½½Ì‘•™…Õ±ĞÕ¹¥Ğ°ÍÑ½É•Ì½¹”ÑåÁ•ÁÉ•‘¥Ñ¥½¸Á•ÈÕ¹¥ÅÕ”¥¹ÁÕĞ°…¹•áÁ¥É•ÌÑ¡”ÁÉ•Ù¥½ÕÌÉ•ÍÕ±Ğİ¡•¸Ñ¡”¥¹ÁÕĞ¡…¹•Ì¸ÍÑ½­½É•…ÍĞ¡™½½‘%¥€…¹ÁÉ•‘¥Ñ¥½¹Ì¡ÑåÁ”°™¥ÉÍĞ°…™Ñ•È¥€…É”É•…µ½¹±ä¡½ÕÍ•¡½±É…Á¡E0ÅÕ•É¥•Ìì½¹±ä==}A1Q%=9€¥Ì¥µÁ±•µ•¹Ñ•Í¼™…È¸É•Í¡¹•ÍÍA½±¥å€ÕÍ•ÌÑ¡”±…Ñ•ÍĞ¥µ…”µ‰…­•Í…µÁ±”…‰½Ù”½¹™¥ÕÉ…‰±”IM!9MM}5%9}=9%9€€¡‘•™…Õ±Ğ€À¸Ø¤°É•ÑÕÉ¹Ì9U11€İ¡•¸µ¥ÍÍ¥¹œ½È•áÁ¥É•°…¹ÕÁ‘…Ñ•Ì½¹±äÑ¡”‘¥ÍÁ±…ä…¡”°¹•Ù•È¥¹Ù•¹Ñ½ÉäÅÕ…¹Ñ¥Ñä½Ù•ÉÍ¥½¸¸‘…¥±äµ…¥¹Ñ•¹…¹”©½ˆÁÕÉ•Ì•áÁ¥É•ÁÉ•‘¥Ñ¥½¸É½İÌ…¹É•™É•Í¡•ÌÍÑ…±”™É•Í¡¹•ÍÌÍ½É•Ì¸¹Á´ÉÕ¸Ñ•ÍĞé¥¹Ñ•É…Ñ¥½¸éÁ¡…Í”İ€½Ù•ÉÌÑ¡”•¹µÑ¼µ•¹‘•Á±•Ñ¥½¸Á…Ñ °¥¹ÁÕĞ‘•‘ÕÁ±¥…Ñ¥½¸½ÍÕÁ•ÉÍ•‘”°™¥Ù”µµ¥¹ÕÑ”Í¡•‘Õ±¥¹œ°…¹™É•Í¡¹•ÍÌ…¡”¥Í½±…Ñ¥½¸¸4(4(ŒŒA¡…Í”€à€¡Í…™•Ñä…Ñ•ÍÕÁÁ±äÉ•½µµ•¹‘…Ñ¥½¹Ì°™¥ÉÍĞ•¹µÑ¼µ•¹ÑåÁ”¤4)5¥É…Ñ¥½¹Ì€ÀÀÄÑ}É•½µµ•¹‘…Ñ¥½¹Ì¹ÍÅ±€Ñ¡É½Õ €ÀÀÄÙ}Í…™•Ñå}¥¹Ù…±¥‘…Ñ¥½¹}Í¹…ÁÍ¡½Ğ¹ÍÅ±€…‘Ñ¡”É•½µµ•¹‘…Ñ¥½¸‰…Í”°MUAA1e}9€‘•Ñ…¥°°•¥¡Ğµ™¥±Ñ•ÈÍ…™•ÑäÙ•É‘¥ÑÌ°Ñ•Éµ¥¹…°±¥™•å±”¡•­Ì°…Ñ¥Ù”µµ•µ‰•ÈÕ…É°Í…™•ÑäÁÉ½™¥±”¥¹Ù…±¥‘…Ñ¥½¸°…¹µ•µ‰•ÈÉ•©½¥¸É•Í•Ğ¸‘•Á±•Ñ¥½¸ÁÉ•‘¥Ñ¥½¸…¸É•…Ñ”…¸¥‘•µÁ½Ñ•¹ĞÁ•Èµµ•µ‰•È‘É…™ĞìÑ¡”½ÕÑ‰½àÍ…™•Ñäİ½É­•È±½­ÌÑ¡”Í¡…É•ÁÉ½™¥±”°É”µÉ•…‘Ì¥Ğ°ÍÑ½É•Ì…±°Ù•É‘¥ÑÌ°…¹¥ÌÑ¡”½¹±ä…ÁÁ±¥…Ñ¥½¸Á…Ñ Ñ¡…Ğ…Ñ¥Ù…Ñ•Ì„É•½µµ•¹‘…Ñ¥½¸¸Q¡”…ÕÑ¡•¹Ñ¥…Ñ•¡½ÕÍ•¡½±É…Á¡E0A$•áÁ½Í•Ì½¹±äÑ¡”ÕÉÉ•¹ĞÕÍ•ÈÌÕ¹•áÁ¥É•Q%Y½AMM€ÍÕÁÁ±äÉ•½µµ•¹‘…Ñ¥½¹Ì°İ¥Ñ …•ÁĞ°‘¥Íµ¥ÍÌ°…¹‘•‰½Õ¹•É••¹•É…Ñ”µÕÑ…Ñ¥½¹Ì¸••‘‰…¬™½±‘Ì½¹”¥¹Ñ¼UÍ•É½½‘AÉ•™•É•¹•€°…¹…¸¡½ÕÉ±ä©½ˆ•áÁ¥É•Ì½±É½İÌ¥¸‰½Õ¹‘•‰…Ñ¡•Ì¸M•”IA!E1}9A=%9QL¹µ‘€¸4(4(ŒŒA¡…Í”€ä€¡ÁÙ•Ñ½ÈÍ•µ…¹Ñ¥ŒÍ•…É ¤4)5¥É…Ñ¥½¹Ì€ÀÀÄİ}Í•µ…¹Ñ¥}Í•…É ¹ÍÅ±€Ñ¡É½Õ €ÀÀÄå}•µ‰•‘‘¥¹}İ½É­•É}É½ÕÑ¥¹•Ì¹ÍÅ±€É•…Ñ”ÑÉ…¹Í…Ñ¥½¹…±±äµ…¥¹Ñ…¥¹•‘½Õµ•¹ÑÌ™½È™½½‘Ì°É•¥Á•Ì°…¹Ñ¥Ñ±•µ•…±Ì°ÑÉ…¬Ñ¡”•µ‰•‘‘¥¹œµ½‘•°°…¹ÁÉ½Ù¥‘”I1LµÍ…™”İ½É­•ÈÉ½ÕÑ¥¹•Ì¸I•ÍÕ±ÑÌ…É”Í½Á•¥¸ME0…¹‰…­•‰äI1Lìµ•…±Ì…É”…‘‘¥Ñ¥½¹…±±äÉ•ÍÑÉ¥Ñ•Ñ¼Ñ¡•¥È½İ¹•È¸…¹‘¥‘…Ñ•ÌÁ…ÍÌÑ¡É½Õ Ñ¡”ÕÍ•ÈÌÍ…™•ÑäÁÉ½™¥±”‰•™½É”‘¥ÍÁ±…ä¸½¹™¥ÕÉ”…¸=Á•¹$µ½µÁ…Ñ¥‰±”•¹‘Á½¥¹ĞÑ¡…ĞÉ•ÑÕÉ¹Ì€ÌàĞ‘¥µ•¹Í¥½¹ÌÕÍ¥¹œ5	%9}A%}UI1€°5	%9}5=1€°…¹½ÁÑ¥½¹…±±ä5	%9}A%}-e€¸Ôµ½‘•±ÌÉ••¥Ù”Ñ¡”É•ÅÕ¥É•Á…ÍÍ…”é€€¼ÅÕ•Éäé€ÁÉ•™¥á•Ìì½Ñ¡•Èµ½‘•±ÌÉ••¥Ù”Á±…¥¸Ñ•áĞ¸Y•Ñ½ÉÌ…É”¹½Éµ…±¥é•°ÁÉ½Ù¥‘•È•ÉÉ½ÉÌÉ•ÑÉäİ¥Ñ ‰½Õ¹‘••áÁ½¹•¹Ñ¥…°‰…­½™˜°…¹¡•…±Ñ …¹¹ÕÑÉ¥Ñ¥½¸™¥•±‘Ì…É”•á±Õ‘•¸™Ñ•È‘½Õµ•¹ÑÌ…É”Id°É•…Ñ”Ñ¡”Á…ÉÑ¥…°!9M\¥¹‘•àİ¥Ñ Á¹Á´‘ˆéÍ•…É é¥¹‘•á€¸Q¡”A$ÅÕ•Éä¥ÌÍ•…É ¡ÅÕ•Éä°ÑåÁ•Ì°™¥ÉÍĞ¥€ì‘•Ñ…¥±Ì…É”¥¸IA!E1}9A=%9QL¹µ‘€¸4(4(ŒŒA¡…Í”€ÄÀ€¡¹½Ñ¥™¥…Ñ¥½¹Ì…¹‘•Ù¥•Ì¤4)5¥É…Ñ¥½¹Ì€ÀÀÈÁ}¹½Ñ¥™¥…Ñ¥½¹Í}‘•Ù¥•Ì¹ÍÅ±€Ñ¡É½Õ €ÀÀÈÉ}¹½Ñ¥™¥…Ñ¥½¹}•áÁ¥Éå}¥¹‘•à¹ÍÅ±€…‘½İ¹•ÈµÍ½Á•‘•Ù¥•Ì°ÁÉ•™•É•¹•Ì°¥¹‰½àÉ•½É‘Ì°…¹„É•ÑÉå…‰±”‘•±¥Ù•ÉäÅÕ•Õ”¸É…Á¡E0ÍÕÁÁ½ÉÑÌ¥¹‰½àÁ…¥¹…Ñ¥½¸°Õ¹É•…½Õ¹ÑÌ°É•…µ…É­¥¹œ°‘•Ù¥”É•¥ÍÑÉ…Ñ¥½¸½É•Ù½…Ñ¥½¸°ÁÉ•™•É•¹”µ…¹…•µ•¹Ğ°…¹„É…Á¡Å°µİÍ€ÍÕ‰ÍÉ¥ÁÑ¥½¸¸áÁ¥Éä…±•ÉÑÌ…É”‘•‘ÕÁ•Á•È¥Ñ•´…¹•áÁ¥Éä‘…Ñ”ìÍ…™•ÑäµÁ…ÍÍ•É•½µµ•¹‘…Ñ¥½¹Ì…±Í¼•¹Ñ•ÈÑ¡”¥¹‰½à¸•±¥Ù•ÉäÕÍ•ÌA½ÍÑÉ•ME0M-%@1=-€°Ñ¥µ•é½¹”µ…İ…É”ÅÕ¥•Ğ¡½ÕÉÌ°…¹‰½Õ¹‘•É•ÑÉ¥•Ì¸µ…¥°¥Ì…Ù…¥±…‰±”İ¡•¸M5Q@¥Ì½¹™¥ÕÉ•¸AÕÍ ÕÍ•Ì4!QQ@ØÄİ¥Ñ Í•ÉÙ¥”µ…½Õ¹Ğ=ÕÑ É•‘•¹Ñ¥…±Ì€¡5}AI=)Q}%€°5}1%9Q}5%1€°5}AI%YQ}-e€¤ì¥=L‘•±¥Ù•ÉäÕÍ•Ì¥É•‰…Í”İ¡•¸A9Ì¥Ì½¹™¥ÕÉ•¥¸Ñ¡”¥É•‰…Í”ÁÉ½©•Ğ¸-••ÀÑ¡”ÁÉ¥Ù…Ñ”­•ä¥¸„±½…°Í•É•ĞÍÑ½É”¸5¥ÍÍ¥¹œÉ•‘•¹Ñ¥…±Ì±•…Ù”ÁÕÍ ÅÕ•Õ•™½ÈÉ•ÑÉäìÁÉ½Ù¥‘•ÈµÉ•Á½ÉÑ•Õ¹É•¥ÍÑ•É•Ñ½­•¹Ì…É”É•Ù½­•¸IÕ¸Á¹Á´Ñ•ÍĞé¥¹Ñ•É…Ñ¥½¸éÁ¡…Í”ÄÁ€……¥¹ÍĞ„‘•‘¥…Ñ•µ¥É…Ñ•Q	M}UI1}QMQ€Ñ¼Ù•É¥™ä‘•‘ÕÁ”°‘¥Í…‰±•ÁÉ•™•É•¹•Ì°Ñ½­•¸É•Ù½…Ñ¥½¸°…¹½¹ÕÉÉ•¹Ğİ½É­•ÉÌ¸M•”IA!E1}9A=%9QL¹µ‘€™½È½Á•É…Ñ¥½¹Ì…¹Á…å±½…‘Ì¸4(4(ŒŒA¡…Í”€ÄÄ€¡¡…É‘•¹¥¹œ…¹Í…±”ƒŠP¥¸ÁÉ½É•ÍÌ¤4(4)Q¡”A$¹½Ü…ÁÁ±¥•Ì„É…Á¡E0½µÁ±•á¥Ñä‰Õ‘•Ğ€¡IA!E1}=5A1a%Qe}1%5%Q€¤¥¸…‘‘¥Ñ¥½¸Ñ¼Ñ¡”‘•ÁÑ ±¥µ¥Ğ°…¹¥¹ÑÉ½ÍÁ•Ñ¥½¸‘•™…Õ±ÑÌ½™˜Õ¹±•ÍÌ•¹…‰±••áÁ±¥¥Ñ±ä¸AÉ½µ•Ñ¡•ÕÌµ½µÁ…Ñ¥‰±”É…Á¡E0±…Ñ•¹ä½•ÉÉ½Èµ•ÑÉ¥Ì…É”…Ù…¥±…‰±”…Ğ€½¡•…±Ñ ½µ•ÑÉ¥Í€İ¡•¸5QI%M}9	1õÑÉÕ•€…¹„€ÌÈµ¡…É…Ñ•È5QI%M}Q=-9€¥Ì½¹™¥ÕÉ•¸A¡…Í”€ÄÄ…ÉÑ¥™…ÑÌÕ¹‘•È‘½Ì½Á¡…Í”ÄÅ€‘•™¥¹”ÁÉ½Á½Í•M1<Ñ…É•ÑÌ°½Á•É…Ñ¥½¹ÌÉÕ¹‰½½­Ì°…¹Ñ¡”I1L…Õ‘¥Ğ¸Q¡”±½…°A$ÕÍ•Ì„¹½¸µÍÕÁ•ÉÕÍ•ÈÉÕ¹Ñ¥µ”±½¥¸ìÁ¹Á´Á¡…Í”ÄÄéÉ±Ìµ…Õ‘¥Ñ€Á…ÍÍ•Ì™½ÈÍ½Á•Ñ…‰±•Ì°¥¹±Õ‘¥¹œÉ•½µµ•¹‘…Ñ¥½¸¥Í½±…Ñ¥½¸¸Á¹Á´Á¡…Í”ÄÄé‰…­ÕÀµÉ•ÍÑ½É•€ÉÕ¹Ì„É•ÍÑ½É”‘É¥±°……¥¹ÍĞÑ¡”¥Í½±…Ñ•Ñ•ÍĞ‘…Ñ…‰…Í”¸1½…½Í½…¬Ñ•ÍÑÌ°A%QH°…¹É•Ù¥•Ü½˜¥‘•¹Ñ¥Ñä½Í•ÍÍ¥½¸½µ•µ‰•ÉÍ¡¥À½½ÕÑ‰½à…•ÍÌÉ•µ…¥¸¥¸ÁÉ½É•ÍÌ¸4(4)½È±½…°‘•Ù•±½Áµ•¹Ğ°¥¹ÍÑ…±°Ñ¡”½ÁÑ¥½¹…°AåÑ¡½¸ÉÕ¹Ñ¥µ”İ¥Ñ ÁåÑ¡½¸€µ´Ù•¹Ø€¹Ù•¹Ù€…¹€¹p¹Ù•¹ÙqMÉ¥ÁÑÍqÁåÑ¡½¸¹•á”€µ´Á¥À¥¹ÍÑ…±°€µÈÉ•ÅÕ¥É•µ•¹ÑÌµ•µ‰•‘‘¥¹Ì¹ÑáÑ€°Ñ¡•¸ÍÑ…ÉĞ¹Á´ÉÕ¸•µ‰•‘‘¥¹Ìé±½…±€¸%ĞÍ•ÉÙ•Ì¥¹Ñ™±½…Ğ½µÕ±Ñ¥±¥¹Õ…°µ”ÔµÍµ…±±€½¸€ÄÈÜ¸À¸À¸ÄèàÀàá€ìÍ•Ğ5	%9}A%}UI0õ¡ÑÑÀè¼¼ÄÈÜ¸À¸À¸ÄèàÀàà½ØÄ½•µ‰•‘‘¥¹Í€…¹5	%9}5=0õ¥¹Ñ™±½…Ğ½µÕ±Ñ¥±¥¹Õ…°µ”ÔµÍµ…±±€¥¸€¹•¹Ù€¸5½‘•°İ•¥¡ÑÌ…É”…¡•Õ¹‘•È€¹±½…°µµ½‘•±Í€…¹•á±Õ‘•™É½´¥Ğ¸4(4(ŒŒ9½Ñ•Ì4(¨ME0¥¸ÁÉ¥Íµ„½µ¥É…Ñ¥½¹Í€¥ÌÑ¡”Í½ÕÉ”½˜ÑÉÕÑ ìÁÉ¥Íµ„½Í¡•µ„¹ÁÉ¥Íµ…€µ¥ÉÉ½ÉÌ¥Ğ€¡É•™É•Í İ¥Ñ Á¹Á´‘ˆéÁÕ±±€¤¸4(¨1½…°A¡…Í”€ĞÙ•É¥™¥…Ñ¥½¸èµ¥É…Ñ¥½¹Ì…ÁÁ±¥•Ñ¼…¥}­¥Ñ¡•¹}¥¹Ñ•±±¥•¹•}ØÉ€°AÉ¥Íµ„Í¡•µ„¥¹ÑÉ½ÍÁ•Ñ•…¹Ù…±¥‘…Ñ•°‰Õ¥±½ÑåÁ•¡•¬½±¥¹ĞÁ…ÍÍ•°€ÈÜÕ¹¥ĞÑ•ÍÑÌÁ…ÍÍ•°…¹Ñ¡”A$¡•…±Ñ •¹‘Á½¥¹Ğ…¹É…Á¡E0Í¡•µ„É•ÍÁ½¹‘•…™Ñ•ÈÉ•ÍÑ…ÉĞ¸ÕÑ¡•¹Ñ¥…Ñ•É…Á¡E0µÕÑ…Ñ¥½¸™±½İÌİ•É”¹½Ğ•á•É¥Í••¹µÑ¼µ•¹¥¸Ñ¡¥ÌÁ…ÍÌ¸4(¨1½…°A¡…Í”€ÔÙ•É¥™¥…Ñ¥½¸èµ¥É…Ñ¥½¸€ÀÀÄÁ}½µµ•É”¹ÍÅ±€…ÁÁ±¥•Ñ¼Ñ¡”‘•‘¥…Ñ•Ñ•ÍĞ‘…Ñ…‰…Í”°¥¹Ñ•É…Ñ¥½¸ÍÉ¥ÁĞÁ…ÍÍ•Á…ÉÑ¥…°½™Õ±°É••¥ÁĞ°É•ÑÉä…¹Í¥µÕ±Ñ…¹•½ÕÌ‘ÕÁ±¥…Ñ”¡•­Ì°…¹Ñ¡”A¡…Í”€Ô‰Õ¥±Á…ÍÍ•¸Q¡”…ÁÁ±¥…Ñ¥½¸‘…Ñ…‰…Í”İ…Ì¹½ĞÕÍ•™½È¥¹Ñ•É…Ñ¥½¸™¥áÑÕÉ•Ì¸4(