import { Injectable } from '@nestjs/common';
import type { Prisma } from '@/generated/client.js';
import type { Tx } from '@/platform/db/tx-context.js';
import type { CatalogRepository } from '@/modules/catalog/domain/ports/catalog.repository.js';
import type { FoodConnection, FoodRow } from '@/modules/catalog/domain/food.types.js';

@Injectable()
export class PrismaCatalogRepository implements CatalogRepository {
  async search(db: Tx, search: string | undefined, first: number, afterId: string | undefined): Promise<FoodConnection> {
    const rows = await db.food.findMany({
      where: {
        archivedAt: null,
        ...(afterId ? { id: { gt: afterId } } : {}),
        ...(search ? { OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { aliases: { some: { aliasNormalized: { contains: normalizeAlias(search) } } } },
        ] } : {}),
      },
      orderBy: { id: 'asc' },
      take: first + 1,
      include: foodDetails,
    });
    const hasNextPage = rows.length > first;
    const page = rows.slice(0, first).map(mapFood);
    return { nodes: page, hasNextPage, endCursor: page.length ? page[page.length - 1]!.id : null };
  }

  async findById(db: Tx, id: string): Promise<FoodRow | null> {
    const row = await db.food.findFirst({ where: { id, archivedAt: null }, include: foodDetails });
    return row ? mapFood(row) : null;
  }
}

const foodDetails = {
  category: { select: { id: true, code: true, name: true } },
  aliases: { select: { id: true, alias: true, isPrimary: true, language: { select: { code: true } } }, orderBy: [{ languageId: 'asc' }, { isPrimary: 'desc' }] },
  nutrition: { select: { caloriesPer100g: true, proteinG: true, carbsG: true, fatG: true, fiberG: true, sugarG: true, sodiumMg: true } },
} satisfies Prisma.FoodInclude;

function normalizeAlias(value: string): string {
  return value.normalize('NFKC').replace(/[\u064b-\u065f\u0670\u0640]/gu, '').replace(/[أإآ]/gu, 'ا').toLowerCase();
}

function mapFood(row: any): FoodRow {
  return { ...row, aliases: row.aliases.map((alias: any) => ({ ...alias, languageCode: alias.language.code })) } as FoodRow;
}
