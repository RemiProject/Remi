import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { AppConfigService } from '@/platform/config/app-config.service.js';
import { PrismaService } from '@/platform/db/prisma.service.js';
import { EMBEDDING_PROVIDER, type EmbeddingProvider } from './embedding-provider.js';
import { serializeNormalizedEmbedding } from './embedding-vector.js';

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
    if (!this.config.runsBackgroundJobs) return;
    if (!this.config.env.EMBEDDING_API_URL || !this.config.env.EMBEDDING_MODEL) {
      this.logger.warn('Search embedding worker is disabled until EMBEDDING_API_URL and EMBEDDING_MODEL are configured');
      return;
    }
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
      }).finally(() => this.schedule(this.config.env.EMBEDDING_POLL_INTERVAL_MS));
    }, delay);
  }

  private async processOne(): Promise<void> {
    const model = this.config.env.EMBEDDING_MODEL;
    if (!model) return;
    const rows = await this.prisma.$queryRaw<PendingDocument[]>`SELECT * FROM search_document_claim(${model})`;
    const document = rows[0];
    if (!document) return;
    const hash = createHash('sha256').update(document.content).digest('hex');
    try {
      const vector = serializeNormalizedEmbedding(await this.embeddings.embed(document.content, 'passage'));
      await this.prisma.$executeRaw`SELECT search_document_complete(${document.id}::uuid, ${document.content}, ${hash}, ${model}, ${vector}::vector)`;
    } catch {
      this.logger.warn(`Embedding failed for search document ${document.id}`);
      await this.prisma.$executeRaw`SELECT search_document_fail(${document.id}::uuid, ${model})`;
    }
  }
}
