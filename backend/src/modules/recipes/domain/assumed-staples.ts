export const ASSUMED_STAPLE_NAMES = ['water', 'salt', 'black pepper'] as const;
export type AssumedStapleName = (typeof ASSUMED_STAPLE_NAMES)[number];

/** The caller supplies active catalog records; lookup/IO stays outside the domain. */
export function resolveAssumedStaples(catalog: readonly { id: string; name: string }[]): {
  foodIds: ReadonlySet<string>;
  missingNames: AssumedStapleName[];
} {
  const foodIds = new Set<string>();
  const missingNames: AssumedStapleName[] = [];
  for (const name of ASSUMED_STAPLE_NAMES) {
    const food = catalog.find((entry) => entry.name.trim().toLowerCase() === name);
    if (food) foodIds.add(food.id);
    else missingNames.push(name);
  }
  return { foodIds, missingNames };
}
