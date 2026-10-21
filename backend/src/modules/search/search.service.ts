import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@/generated/client.js';
import { PrismaService } from '@/platform/db/prisma.service.js';
import { EMBEDDING_PROVIDER, type EmbeddingProvider } from './embedding-provider.js';
import { SearchDocumentSourceType } from './search.types.js';

interface SearchRow { id: string; sourceType: SearchDocumentSourceType; content: string; score: number }

@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(EMBEDDING_PROVIDER) private readonly embeddings: EmbeddingProvider,
  ) {}

  async search(query: string, householdId: string, types: SearchDocumentSourceType[] | undefined, first: number) {
    const normalized = query.trim().slice(0, 500);
    if (!normalized) return [];
    const vector = `[${(await this.embeddings.embed(normalized)).join(',')}]`;
    const limit = Math.max(1, Math.min(first, 20));
    const sourceTypes = types?.length ? types : Object.values(SearchDocumentSourceType);
    const rows = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('hnsw.ef_search', '80', true)`;
      await tx.$queryRaw`SELECT set_config('hnsw.iterative_scan', 'relaxed_order', true)`;
      return tx.$queryRaw<SearchRow[]>(Prisma.sql`
        SELECT "sourceId" AS id, "sourceType", "content",
          (1 - ("embedding" <=> ${vector}::vector))::float8 AS score
        FROM "SearchDocument"
        WHERE "embeddingStatus" = 'READY'
          AND "embedding" IS NOT NULL
          AND ("householdId" IS NULL OR "householdId" = ${householdId}::uuid)
          AND "sourceType"::text = ANY(${sourceTypes}::text[])
        ORDER BY "embedding" <=> ${vector}::vector
        LIMIT ${limit}
      `);
    });
    return rows.map((row) => ({
      id: row.id,
      type: row.sourceType,
      title: row.content.split('. ')[0]?.slice(0, 200) ?? '',
      excerpt: row.content.slice(0, 500),
      score: row.score,
    }));
  }
}
