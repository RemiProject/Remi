import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';

const endpoint = process.env.REMI_API_URL ?? 'http://localhost:3100/graphql';
if (!new URL(endpoint).hostname.match(/^(localhost|127\.0\.0\.1)$/) || new URL(endpoint).port !== '3100') throw new Error('This verifier only targets the independent local API3100.');
let checks = 0;
const pass = message => { checks++; console.log(`PASS ${message}`); };
async function gql(query, variables = {}, context = {}) {
  const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', ...(context.token ? { authorization: `Bearer ${context.token}` } : {}), ...(context.household ? { 'x-household-id': context.household } : {}) }, body: JSON.stringify({ query, variables }) });
  const result = await response.json();
  if (result.errors?.length) throw Object.assign(new Error(result.errors.map(error => error.message).join('; ')), { codes: result.errors.map(error => error.extensions?.code) });
  assert.ok(result.data); return result.data;
}
async function account() {
  const suffix = randomBytes(5).toString('hex'); const email = `cookbook_${suffix}@example.test`; const password = `Cookbook!7${randomBytes(12).toString('hex')}`;
  await gql('mutation Register($input: RegisterInput!) { register(input: $input) { userId } }', { input: { email, username: `cookbook_${suffix}`, phoneNumber: `+2010${String(parseInt(suffix.slice(0, 6), 16)).padStart(8, '0')}`, password, name: 'Cookbook verification', timezone: 'Africa/Cairo', languageCode: 'en' } });
  const token = (await gql('mutation Login($input: LoginInput!) { login(input: $input) { accessToken } }', { input: { identifier: email, password } })).login.accessToken;
  const household = (await gql('mutation NewKitchen($input: CreateHouseholdInput!) { createHousehold(input: $input) }', { input: { name: `Verification ${suffix}`, timezone: 'Africa/Cairo' } }, { token })).createHousehold;
  return { token, household };
}
const owner = await account(), other = await account();
pass('two independent verified account/household sessions created');
const recipes = (await gql('{ recipes(first: 50) { nodes { id name servings } } }', {}, owner)).recipes.nodes;
assert.ok(recipes.length >= 8); const recipe = (await gql('query Detail($id: ID!) { recipe(id: $id) { id name servings ingredients { foodId foodName quantity unit optional } steps { instruction } } }', { id: recipes[0].id }, owner)).recipe;
assert.ok(recipe.ingredients.length >= 3); assert.ok(recipe.steps.length >= 3); pass('catalogue recipes and full ingredients/steps load through GraphQL');
const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const plan = (await gql('mutation NewPlan($input: CreateMealPlanInputType!) { createMealPlan(input: $input) { id } }', { input: { name: 'Verification plan', startDate: date, endDate: date } }, owner)).createMealPlan;
const plannedInput = { mealPlanId: plan.id, recipeId: recipe.id, mealDate: date, mealType: 'DINNER', servings: '2' };
const plannedQuery = 'mutation Plan($input: PlanMealInputType!) { planMeal(input: $input) { id } }';
const first = (await gql(plannedQuery, { input: plannedInput }, owner)).planMeal;
const replay = (await gql(plannedQuery, { input: plannedInput }, owner)).planMeal; assert.equal(first.id, replay.id); pass('planning an identical meal twice returns one persisted entry');
await gql('mutation Remove($id: ID!) { removePlannedMeal(id: $id) }', { id: first.id }, other);
assert.equal((await gql('query Plans($from: String!, $to: String!) { mealPlans(from: $from,to: $to) { meals { id } } }', { from: date, to: date }, owner)).mealPlans[0].meals.length, 1);
await gql('mutation Remove($id: ID!) { removePlannedMeal(id: $id) }', { id: first.id }, owner); pass('planned meal removal is household isolated');
const list = (await gql('mutation List($input: CreateShoppingListInputType!) { createShoppingList(input: $input) { id } }', { input: { name: 'Verification groceries', idempotencyKey: randomUUID() } }, owner)).createShoppingList;
const ingredient = recipe.ingredients[0]; const shoppingInput = { shoppingListId: list.id, foodId: ingredient.foodId, quantity: '1', unit: ingredient.unit, idempotencyKey: randomUUID() };
const item = (await gql('mutation Add($input: AddToShoppingListInputType!) { addToShoppingList(input: $input) { id } }', { input: shoppingInput }, owner)).addToShoppingList;
assert.equal((await gql('mutation Add($input: AddToShoppingListInputType!) { addToShoppingList(input: $input) { id } }', { input: shoppingInput }, owner)).addToShoppingList.id, item.id);
await gql('mutation Check($input: UpdateShoppingItemInputType!) { updateShoppingListItem(input: $input) { status } }', { input: { id: item.id, status: 'PURCHASED' } }, owner);
await gql('mutation Remove($id: ID!) { removeShoppingItem(id: $id) }', { id: item.id }, other);
assert.equal((await gql('{ shoppingLists { items { id status } } }', {}, owner)).shoppingLists[0].items[0].status, 'PURCHASED');
await gql('mutation Remove($id: ID!) { removeShoppingItem(id: $id) }', { id: item.id }, owner); pass('shopping add replay, check-off and remove preserve household isolation');
await gql('mutation Goals($input: SetGoalInputType!) { setGoal(input: $input) { goalType calorieTarget } }', { input: { goalType: 'MAINTAIN', calorieTarget: 2000 } }, owner);
await gql('mutation Diet($input: SetDietaryPreferencesInputType!) { setDietaryPreferences(input: $input) { dietaryPreferences } }', { input: { preferences: ['VEGETARIAN'] } }, owner);
const profile = (await gql('{ myProfile { goal { calorieTarget } dietaryPreferences } }', {}, owner)).myProfile; assert.equal(profile.goal.calorieTarget, 2000); assert.deepEqual(profile.dietaryPreferences, ['VEGETARIAN']); pass('profile goals and dietary preferences persist');
await gql('mutation Preference($type: NotificationType!, $channel: NotificationChannel!, $isEnabled: Boolean!) { updateNotificationPreference(type:$type,channel:$channel,isEnabled:$isEnabled) { type isEnabled } }', { type: 'EXPIRY_SOON', channel: 'EMAIL', isEnabled: false }, owner);
assert.equal((await gql('{ notificationPreferences { type channel isEnabled } }', {}, owner)).notificationPreferences.find(entry => entry.type === 'EXPIRY_SOON' && entry.channel === 'EMAIL').isEnabled, false); pass('notification preferences persist');
const logInput = { mealType: 'OTHER', origin: 'AWAY', name: 'Verification meal', eatenAt: new Date().toISOString(), idempotencyKey: randomUUID(), items: [{ foodId: ingredient.foodId, amount: '100', unit: 'GRAM' }] };
const logQuery = 'mutation Meal($input: LogMealInputType!) { logMeal(input:$input) { __typename ... on MealLogSuccessType { replayed meals { id } } } }';
const meal = (await gql(logQuery, { input: logInput }, owner)).logMeal; assert.equal(meal.__typename, 'MealLogSuccessType'); assert.equal((await gql(logQuery, { input: logInput }, owner)).logMeal.replayed, true); pass('meal logging replays without duplicate meals');
const stockInput = { foodId: ingredient.foodId, amount: '200', unit: 'GRAM', storageLocation: 'FRIDGE', idempotencyKey: randomUUID() };
await gql('mutation Stock($input: InventoryStockInput!) { addStock(input:$input) { __typename } }', { input: stockInput }, owner);
const stock = (await gql('{ inventory(first:50) { nodes { id version foodId storageLocation estimatedExpiryAt } } }', {}, owner)).inventory.nodes.find(entry => entry.foodId === ingredient.foodId);
const metadataInput = { inventoryItemId: stock.id, expectedVersion: stock.version, storageLocation: 'PANTRY', estimatedExpiryAt: `${date}T21:59:59.999Z` };
await assert.rejects(gql('mutation Meta($input: InventoryMetadataInput!) { updateInventoryMetadata(input:$input) { id version } }', { input: metadataInput }, other));
await gql('mutation Meta($input: InventoryMetadataInput!) { updateInventoryMetadata(input:$input) { id version storageLocation } }', { input: metadataInput }, owner);
await assert.rejects(gql('mutation Meta($input: InventoryMetadataInput!) { updateInventoryMetadata(input:$input) { id version } }', { input: { ...metadataInput, storageLocation: 'FREEZER' } }, owner));
const updated = (await gql('query Food($id:ID!) { inventoryItem(id:$id) { storageLocation estimatedExpiryAt version quantity } }', { id: stock.id }, owner)).inventoryItem; assert.equal(updated.storageLocation, 'PANTRY'); assert.equal(updated.quantity, '200.000'); pass('metadata edit changes storage/date without stock delta, rejects foreign household and stale version');
console.log(`Connected feature verification: ${checks} checks passed. Disposable test data remains only in the independent database.`);
