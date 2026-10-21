import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { Prisma } from '@/generated/client.js';
import { AppConfigService } from '@/platform/config/app-config.service.js';
import { PrismaService } from '@/platform/db/prisma.service.js';
import { EMBEDDING_PROVIDER, type EmbeddingProvider } from './embedding-provider.js';

interface PendingDocument { id: string; content: string }

@Injectable()
export class EmbeddingWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(EmbeddingWorker.name);
  private timer?: NodeJS.Timeout;
  private running?: Promise<void>;
  private stopping = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    @Inject(EMBEDDING_PROVIDER) private readonly embeddings: EmbeddingProvider,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.env.EMBEDDING_API_URL || !this.config.env.EMBEDDING_MODEL) return;
    this.schedule(1000);
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearTimeout(this.timer);
    await this.running;
  }

  private schedule(delay: number): void {
    if (this.stopping) return;
    this.timer = setTimeout(() => {
      this.running = this.processOne().catch(() => {
        this.logger.warn('Search embedding worker iteration failed');
      }).finally(() => this.schedule(1500));
    }, delay);
  }

  private async processOne(): Promise<void> {
    const document = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<PendingDocument[]>(Prisma.sql`
        SELECT "id", "content" FROM "SearchDocument"
        WHERE "embeddingStatus" = 'PENDING'
          OR ("embeddingStatus" = 'FAILED' AND "updatedAt" < now() - interval '30 seconds')
          OR ("embeddingStatus" = 'PROCESSING' AND "embeddingClaimedAt" < now() - interval '5 minutes')
        ORDER BY "updatedAt" ASC
        FOR UPDATE SKIP LOCKED LIMIT 1
      `);
      const row = rows[0];
      if (!row) return undefined;
      await tx.$executeRaw`UPDATE "SearchDocument" SET "embeddingStatus" = 'PROCESSING', "embeddingClaimedAt" = now(), "updatedAt" = now() WHERE "id" = ${row.id}::uuid`;
      return row;
    });
    if (!document) return;
    const hash = createHash('sha256').update(document.content).digest('hex');
    try {
      const vector = `[${(await this.embeddings.embed(document.content)).join(',')}]`;
      await this.prisma.$executeRaw`UPDATE "SearchDocument"
        SET "embedding" = ${vector}::vector, "embeddedContentHash" = ${hash},
            "embeddingStatus" = 'READY', "embeddingClaimedAt" = NULL,
            "embeddingUpdatedAt" = now(), "lastEmbeddingError" = NULL
        WHERE "id" = ${document.id}::uuid AND "content" = ${document.content}`;
    } catch {
      this.logger.warn(`Embedding failed for search document ${document.id}`);
      await this.prisma.$executeRaw`UPDATE "SearchDocument" SET "embeddingStatus" = 'FAILED', "embeddingClaimedAt" = NULL, "lastEmbeddingError" = 'provider_error', "updatedAt" = now() WHERE "id" = ${document.id}::uuid AND "embeddingStatus" = 'PROCESSING'`;
    }
  }
}
