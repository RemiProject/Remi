import pg from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required. This script only reads PostgreSQL catalog metadata.');

const scopedTables = new Set([
  'AIPrediction', 'AIFoodDepletionPrediction', 'FreshnessPrediction', 'AIRecommendation',
  'AIShoppingRecommendation', 'AIRecommendationSafetyCheck', 'FoodEvent', 'Image',
  'InventoryItem', 'InventoryTransaction', 'Meal', 'MealItem', 'MealPlan', 'PlannedMeal',
  'PurchaseOrder', 'PurchaseOrderItem', 'Recipe', 'RecipeIngredient', 'RecipeStep',
  'SearchDocument', 'ShoppingList', 'ShoppingListItem', 'Notification', 'NotificationDelivery',
  'NotificationPreference', 'UserDevice', 'UserAllergy', 'UserAllergyCategory', 'UserDailyNutrition',
  'UserDietaryPreference', 'UserDislikedCategory', 'UserDislikedFood', 'UserFoodPreference',
  'UserGoal', 'UserHealthCondition', 'UserNutritionTrend', 'UserPreference', 'UserPreferredCuisine',
  'UserProfile', 'UserSafetyProfileEvent', 'UserWeightLog',
]);

const client = new pg.Client({ connectionString });
const findings = [];
try {
  await client.connect();
  const role = (await client.query(`SELECT current_user AS name, r.rolsuper AS superuser, r.rolbypassrls AS bypass_rls
    FROM pg_roles r WHERE r.rolname = current_user`)).rows[0];
  const tables = (await client.query(`SELECT c.relname AS name, c.relrowsecurity AS rls_enabled,
    c.relforcerowsecurity AS rls_forced, count(p.policyname)::int AS policy_count,
    pg_get_userbyid(c.relowner) AS owner
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_policies p ON p.schemaname = n.nspname AND p.tablename = c.relname
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    GROUP BY c.relname, c.relrowsecurity, c.relforcerowsecurity, c.relowner ORDER BY c.relname`)).rows;
  const stats = (await client.query(`SELECT
      CASE WHEN pg_has_role(current_user, 'pg_read_all_settings', 'member')
        THEN current_setting('shared_preload_libraries') ELSE NULL END AS preloaded,
      pg_has_role(current_user, 'pg_read_all_settings', 'member') AS can_read_settings,
      EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements') AS extension_installed`)).rows[0];

  console.log(`Database role: ${role.name}; superuser=${role.superuser}; bypassrls=${role.bypass_rls}`);
  console.log(`Public tables: ${tables.length}; tables with RLS: ${tables.filter((table) => table.rls_enabled).length}`);
  const preload = stats.can_read_settings ? stats.preloaded || '(none)' : '(not visible to runtime role)';
  console.log(`pg_stat_statements: installed=${stats.extension_installed}; preload=${preload}`);

  if (role.superuser || role.bypass_rls) findings.push(`CRITICAL: runtime connection role ${role.name} bypasses row-level security.`);
  for (const table of tables) {
    if (!scopedTables.has(table.name)) continue;
    if (!table.rls_enabled || !table.policy_count) findings.push(`HIGH: ${table.name} has no effective row-level security policy.`);
    else if (!table.rls_forced && table.owner === role.name) findings.push(`HIGH: ${table.name} RLS is not forced while the connection role owns it.`);
  }
  for (const finding of findings) console.error(finding);
  if (!findings.length) console.log('PASS: no RLS gaps found for the scoped tables on this connection.');
} finally {
  await client.end();
}

if (findings.length) process.exitCode = 2;
