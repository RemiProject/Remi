import { describe, expect, it, vi } from 'vitest';
import type { Tx } from '@/platform/db/tx-context.js';
import { PrismaCatalogRepository } from '@/modules/catalog/infrastructure/repositories/prisma-catalog.repository.js';

describe('PrismaCatalogRepository', () => {
  it('searches canonical names and normalized aliases with one eager-loaded page', async () => {
    const food = {
      id: '019a0000-0000-7000-8000-000000000001',
      name: 'Rice',
      defaultUnit: 'GRAM',
      gramsPerPiece: null,
      densityGPerMl: null,
      category: { id: 'category-id', code: 'GRAINS', name: 'Grains' },
      aliases: [{ id: 'alias-id', alias: 'أرز', isPrimary: true, language: { code: 'ar' } }],
      nutrition: null,
    };
    const findMany = vi.fn().mockResolvedValue([food]);
    const db = { food: { findMany } } as unknown as Tx;
    const result = await new PrismaCatalogRepository().search(db, 'أُرز', 20, undefined);

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ archivedAt: null, OR: [
        { name: { contains: 'أُرز', mode: 'insensitive' } },
        { aliases: { some: { aliasNormalized: { contains: 'ارز' } } } },
      ] }),
      take: 21,
      include: expect.objectContaining({ category: expect.any(Object), aliases: expect.any(Object), nutrition: expect.any(Object) }),
    }));
    expect(result.nodes[0]?.aliases[0]).toMatchObject({ alias: 'أرز', languageCode: 'ar' });
    expect(result.hasNextPage).toBe(false);
  });

  it('returns a next cursor only for the last item in the requested page', async () => {
    const rows = [1, 2].map((n) => ({
      id: `019a0000-0000-7000-8000-00000000000${n}`,
      aliases: [],
    }));
    const db = { food: { findMany: vi.fn().mockResolvedValue(rows) } } as unknown as Tx;
    const result = await new PrismaCatalogRepository().search(db, undefined, 1, undefined);
    expect(result.hasNextPage).toBe(true);
    expect(result.endCursor).toBe(rows[0]!.id);
    expect(result.nodes).toHaveLength(1);
  });
});
