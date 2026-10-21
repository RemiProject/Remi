import { Injectable, Logger, type OnApplicationShutdown, type OnApplicationBootstrap } from '@nestjs/common';
import { AppConfigService } from '@/platform/config/app-config.service.js';
import { PrismaService } from '@/platform/db/prisma.service.js';
import { backoffMs } from './backoff.js';
import type { OutboxMessage } from './outbox-handler.decorator.js';
import { OutboxHandlerRegistry } from './outbox-handler.registry.js';

const LEASE_SECONDS = 60;

interface ClaimedRow {
  id: bigint;
  topic: string;
  householdId: string | null;
  dedupeKey: string;
  payload: unknown;
  attempts: number;
}

/**
 * Claim (short TX, SKIP LOCKED + lease) -> run handler OUTSIDE any TX -> mark result (short TX).
 * Only topics with a registered handler are selected, so e.g. `image.uploaded` rows simply wait.
 */
@Injectable()
export class OutboxPoller implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(OutboxPoller.name);
  private timer?: NodeJS.Timeout;
  private stopping = false;
  private running: Promise<void> = Promise.resolve();

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: OutboxHandlerRegistry,
    private readonly config: AppConfigService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.env.ENABLE_OUTBOX_POLLER) return;
    this.schedule();
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearTimeout(this.timer);
    await this.running;
  }

  private schedule(): void {
    if (this.stopping) return;
    this.timer = setTimeout(() => {
      this.running = this.tick()
        .then(() => undefined)
        .catch((err) => this.logger.error(`poll failed: ${(err as Error).message}`))
        .finally(() => this.schedule());
    }, this.config.env.OUTBOX_POLL_INTERVAL_MS);
  }

  /** One polling pass. Public so tests and admin tooling can drive it. Returns the number of rows handled. */
  async tick(): Promise<number> {
    const topics = this.registry.topics();
    if (topics.length === 0) return 0;

    const rows = await this.prisma.$queryRaw<ClaimedRow[]>`
      UPDATE "OutboxEvent" SET "nextAttemptAt" = now() + (${LEASE_SECONDS} * interval '1 second')
      WHERE "id" IN (
        SELECT "id" FROM "OutboxEvent"
        WHERE "topic" = ANY(${topics}::text[])
          AND "processedAt" IS NULL AND "deadLetteredAt" IS NULL AND "nextAttemptAt" <= now()
        ORDER BY "nextAttemptAt", "id"
        LIMIT ${this.config.env.OUTBOX_BATCH_SIZE}
        FOR UPDATE SKIP LOCKED)
      RETURNING "id", "topic", "householdId", "dedupeKey", "payload", "attempts"`;

    for (const row of rows) {
      if (this.stopping) break;
      await this.process(row);
    }
    return rows.length;
  }

  private async process(row: ClaimedRow): Promise<void> {
    const handler = this.registry.get(row.topic);
    const message: OutboxMessage = { ...row, payload: row.payload };
    try {
      if (!handler) throw new Error(`No handler for topic ${row.topic}`);
      await handler.handle(message);
      // A producer may have moved nextAttemptAt forward while the handler was running.
      // In that case the coalesced event still represents newer work and must be retried.
      await this.prisma.$executeRaw`UPDATE "OutboxEvent" SET "processedAt" = now(), "lastError" = NULL WHERE "id" = ${row.id} AND "processedAt" IS NULL AND "deadLetteredAt" IS NULL AND "nextAttemptAt" <= now() + (${LEASE_SECONDS} * interval '1 second')`;
    } catch (err) {
      const attempts = row.attempts + 1;
      const error = String((err as Error)?.message ?? err).slice(0, 500);
      const dead = attempts >= this.config.env.OUTBOX_MAX_ATTEMPTS;
      this.logger.warn(`outbox #${row.id} (${row.topic}) failed attempt ${attempts}${dead ? ' -> dead letter' : ''}: ${error}`);
      await this.prisma.$executeRaw`
        UPDATE "OutboxEvent"
        SET "attempts" = ${attempts}, "lastError" = ${error},
            "nextAttemptAt" = now() + (${backoffMs(attempts)} * interval '1 millisecond'),
            "deadLetteredAt" = CASE WHEN ${dead} THEN now() ELSE NULL END
        WHERE "id" = ${row.id} AND "processedAt" IS NULL AND "deadLetteredAt" IS NULL`;
    }
  }
}
