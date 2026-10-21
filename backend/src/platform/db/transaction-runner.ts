import { Injectable } from '@nestjs/common';
import { isRetryable } from '@/shared/db-errors.js';
import { PrismaService } from './prisma.service.js';
import type { Tx, TxScope } from './tx-context.js';

const MAX_RETRIES = 3;

/**
 * The only place transactions are opened.
 *  - retries on serialization failure / deadlock (40001 / 40P01) with jitter
 *  - exposes app.user_id / app.household_id so RLS policies can be switched on later without code changes
 *  - RULE: never do network I/O (SMTP, S3, HTTP) inside `fn`.
 */
@Injectable()
export class TransactionRunner {
  constructor(private readonly prisma: PrismaService) {}

  /** Non-transactional client for read paths (queries). */
  get db(): Tx {
    return this.prisma as unknown as Tx;
  }

  async run<T>(fn: (tx: Tx) => Promise<T>, scope: TxScope = {}): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT set_config('app.user_id', ${scope.userId ?? ''}, true), set_config('app.household_id', ${scope.householdId ?? ''}, true)`;
          return fn(tx);
        });
      } catch (err) {
        if (attempt < MAX_RETRIES && isRetryable(err)) {
          await new Promise((resolve) => setTimeout(resolve, 20 + Math.floor(Math.random() * 80) * (attempt + 1)));
          continue;
        }
        throw err;
      }
    }
  }
}
