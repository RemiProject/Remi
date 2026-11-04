import type { createAuthService } from './auth-service';

type Auth = Pick<ReturnType<typeof createAuthService>, 'authenticatedGraphql'>;
interface CatalogFood {
  id: string;
  aliases: { alias: string; languageCode: string; isPrimary: boolean }[];
}

function arabicName(food: CatalogFood): string | undefined {
  const aliases = food.aliases.filter(alias => /^ar(?:[-_]|$)/i.test(alias.languageCode) && alias.alias.trim());
  return (aliases.find(alias => alias.isPrimary) ?? aliases[0])?.alias.trim();
}

/** Kitchen and Recipes share the same catalog metadata cache for this identity. */
export async function loadInventoryArabicNames(auth: CatalogAuth, foodIds: readonly string[]): Promise<Map<string, string>> {
  return loadCachedCatalogArabicNames(auth, foodIds);
}

export const catalogArabicNamesOperation = `query CatalogArabicNames($after:String) {
  foods(first:50, after:$after) { nodes { id aliases { alias languageCode isPrimary } } hasNextPage endCursor }
}`;
type CatalogAuth = Auth & Pick<ReturnType<typeof createAuthService>, 'getIdentityRevision'>;
const catalogNames = new WeakMap<CatalogAuth, { revision: number; pending: Promise<Map<string, string>> }>();

/** Kitchen and recipe pages can reference hundreds of foods. One paginated catalog read per identity
 * avoids exhausting resolver rate limits with hundreds of aliased food(id) fields.
 * Memory only; failed reads are retryable and account changes never share this cache.
 */
export async function loadCachedCatalogArabicNames(auth: CatalogAuth, foodIds: readonly string[]): Promise<Map<string, string>> {
  if (!foodIds.length) return new Map();
  const revision = auth.getIdentityRevision();
  let cached = catalogNames.get(auth);
  if (!cached || cached.revision !== revision) {
    const pending = (async () => {
      const names = new Map<string, string>(), cursors = new Set<string>();
      let after: string | null = null;
      do {
        if (auth.getIdentityRevision() !== revision) throw new Error('Your account changed while loading catalog names.');
        const data: { foods: { nodes: CatalogFood[]; hasNextPage: boolean; endCursor: string | null } } = await auth.authenticatedGraphql(catalogArabicNamesOperation, { after });
        if (auth.getIdentityRevision() !== revision) throw new Error('Your account changed while loading catalog names.');
        const page = data.foods;
        if (!page || !Array.isArray(page.nodes) || typeof page.hasNextPage !== 'boolean') throw new Error('Invalid catalog name page.');
        for (const food of page.nodes) {
          if (!food.id || !Array.isArray(food.aliases)) throw new Error('Invalid catalog aliases returned by the backend.');
          const name = arabicName(food); if (name) names.set(food.id, name);
        }
        if (!page.hasNextPage) break;
        if (!page.endCursor || cursors.has(page.endCursor)) throw new Error('Catalog name pagination did not advance.');
        cursors.add(page.endCursor); after = page.endCursor;
      } while (after);
      return names;
    })();
    cached = { revision, pending }; catalogNames.set(auth, cached);
    const entry = cached;
    void pending.catch(() => { if (catalogNames.get(auth) === entry) catalogNames.delete(auth); });
  }
  const names = await cached.pending;
  if (auth.getIdentityRevision() !== revision) throw new Error('Your account changed while loading catalog names.');
  return new Map(foodIds.flatMap(id => names.has(id) ? [[id, names.get(id)!] as const] : []));
}
