import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AppConfigService } from '@/platform/config/app-config.service.js';
import { newId } from '@/shared/ids.js';
import { TransactionRunner } from '@/platform/db/transaction-runner.js';
import type { Tx } from '@/platform/db/tx-context.js';
import { OutboxHandler, type OutboxHandlerPort, type OutboxMessage } from '@/platform/outbox/outbox-handler.decorator.js';

type MealLoggedPayload = { mealIds: string[] };
type UserDay = { userId: string; localDate: string };

@Injectable()
@OutboxHandler('meal.logged')
export class DailyNutritionProjector implements OutboxHandlerPort<MealLoggedPayload>, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DailyNutritionProjector.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly transactions: TransactionRunner, private readonly config: AppConfigService) {}

  onModuleInit(): void {
    if (!this.config.runsBackgroundJobs) return;
    this.timer = setInterval(() => void this.projectRecent(), 60 * 60 * 1000);
    this.timer.unref?.();
    void this.projectRecent();
  }

  onModuleDestroy(): void { if (this.timer) clearInterval(this.timer); }

  async handle(message: OutboxMessage<MealLoggedPayload>): Promise<void> {
    if (!message.householdId || !Array.isArray(message.payload?.mealIds) || !message.payload.mealIds.length) return;
    await this.transactions.run(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.household_id', ${message.householdId!}, true)`;
      const days = await tx.$queryRaw<UserDay[]>`
        SELECT DISTINCT m."userId", (m."eatenAt" AT TIME ZONE u."timezone")::date::text AS "localDate"
        FROM "Meal" m JOIN "User" u ON u."id" = m."userId"
        WHERE m."householdId" = ${message.householdId!}::uuid AND m."id" = ANY(${message.payload.mealIds}::uuid[])`;
      for (const day of days) await projectDay(tx, day.userId, day.localDate);
    });
  }

  async projectRecent(): Promise<void> {
    try {
      await this.transactions.run(async (tx) => {
        const users = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "User" WHERE "deletedAt" IS NULL ORDER BY "id"`;
        for (const user of users) {
          await tx.$executeRaw`SELECT set_config('app.user_id', ${user.id}, true)`;
          const days = await tx.$queryRaw<UserDay[]>`
            SELECT DISTINCT m."userId", (m."eatenAt" AT TIME ZONE u."timezone")::date::text AS "localDate"
            FROM "Meal" m JOIN "User" u ON u."id" = m."userId"
            WHERE m."userId" = ${user.id}::uuid AND m."eatenAt" >= now() - interval '3 days'`;
          for (const day of days) await projectDay(tx, day.userId, day.localDate);
        }
      });
    } catch (error) {
      this.logger.error(error, 'Daily nutrition refresh failed');
    }
  }
}

async function projectDay(tx: Tx, userId: string, localDate: string): Promise<void> {
  await tx.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`;
  await tx.$executeRaw`
    INSERT INTO "UserDailyNutrition" ("id", "userId", "date", "calories", "proteinG", "carbsG", "fatG", "fiberG", "sugarG", "sodiumMg", "mealCount", "computedAt")
    SELECT ${newId()}::uuid, ${userId}::uuid, ${localDate}::date,
      COALESCE(sum(mi."calories"), 0), COALESCE(sum(mi."proteinG"), 0), COALESCE(sum(mi."carbsG"), 0),
      COALESCE(sum(mi."fatG"), 0), COALESCE(sum(mi."fiberG"), 0), COALESCE(sum(mi."sugarG"), 0), COALESCE(sum(mi."sodiumMg"), 0),
      count(DISTINCT m."id")::integer, now()
    FROM "User" u
    LEFT JOIN "Meal" m ON m."userId" = u."id" AND (m."eatenAt" AT TIME ZONE u."timezone")::date = ${localDate}::date
    LEFT JOIN "MealItem" mi ON mi."mealId" = m."id"
    WHERE u."id" = ${userId}::uuid
    GROUP BY u."id"
    ON CONFLICT ("userId", "date") DO UPDATE SET
      "calories" = EXCLUDED."calories", "proteinG" = EXCLUDED."proteinG", "carbsG" = EXCLUDED."carbsG", "fatG" = EXCLUDED."fatG",
      "fiberG" = EXCLUDED."fiberG", "sugarG" = EXCLUDED."sugarG", "sodiumMg" = EXCLUDED."sodiumMg", "mealCount" = EXCLUDED."mealCount", "computedAt" = now()
    WHERE NOT "UserDailyNutrition"."isFinal"`;
}
