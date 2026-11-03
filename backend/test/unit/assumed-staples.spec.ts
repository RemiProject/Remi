import { describe, expect, it } from 'vitest';
import { resolveAssumedStaples } from '@/modules/recipes/domain/assumed-staples.js';

describe('resolveAssumedStaples', () => {
  it('resolves current catalog IDs rather than storing UUIDs or assuming all spices', () => {
    const result = resolveAssumedStaples([
      { id: 'current-water', name: 'water' }, { id: 'current-salt', name: 'Salt' },
      { id: 'current-pepper', name: 'black pepper' }, { id: 'chili', name: 'chili pepper' },
    ]);
    expect([...result.foodIds]).toEqual(['current-water', 'current-salt', 'current-pepper']);
    expect(result.missingNames).toEqual([]);
    expect([...resolveAssumedStaples([{ id: 'different-id', name: 'water' }]).foodIds]).toEqual(['different-id']);
  });

  it('reports absent catalog staples without inventing IDs or using aliases as substitutions', () => {
    expect(resolveAssumedStaples([{ id: 'table-salt', name: 'table salt' }])).toEqual({
      foodIds: new Set(), missingNames: ['water', 'salt', 'black pepper'],
    });
  });
});
