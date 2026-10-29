import type { createAuthService } from './auth-service';

type Auth = Pick<ReturnType<typeof createAuthService>, 'authenticatedGraphql'>;
interface CatalogFood {
  id: string;
  aliases: { alias: string; languageCode: string; isPrimary: boolean }[];
}

export function inventoryFoodNamesOperation(count: number): string {
  const variables = Array.from({ length: count }, (_, i) => `$id${i}: ID!`).join(', ');
  const fields = Array.from({ length: count }, (_, i) => `f${i}: food(id: $id${i}) { id aliases { alias languageCode isPrimary } }`).join(' ');
  return `query InventoryFoodNames(${variables}) { ${fields} }`;
}

/** Display metadata only. Missing Arabic aliases use the inventory's canonical name. */
export async function loadInventoryArabicNames(auth: Auth, foodIds: readonly string[]): Promise<Map<string, string>> {
  const ids = [...new Set(foodIds)];
  const names = new Map<string, string>();
  for (let start = 0; start < ids.length; start += 20) {
    const batch = ids.slice(start, start + 20);
    const data = await auth.authenticatedGraphql<Record<string, CatalogFood | null>>(inventoryFoodNamesOperation(batch.length),
      Object.fromEntries(batch.map((id, i) => [`id${i}`, id])));
    batch.forEach((id, i) => {
      const food = data[`f${i}`];
      if (food === null) return;
      if (!food || food.id !== id || !Array.isArray(food.aliases)) throw new Error('Invalid catalog aliases returned by the backend.');
      const aliases = food.aliases.filter(alias => /^ar(?:[-_]|$)/i.test(alias.languageCode) && alias.alias.trim());
      const name = (aliases.find(alias => alias.isPrimary) ?? aliases[0])?.alias.trim();
      if (name) names.set(id, name);
    });
  }
  return names;
}
