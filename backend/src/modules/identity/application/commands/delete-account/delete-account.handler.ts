import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { DomainError } from '@/shared/domain-error.js';
import { TransactionRunner } from '@/platform/db/transaction-runner.js';
import type { Tx } from '@/platform/db/tx-context.js';
import { PASSWORD_HASHER, type PasswordHasherPort } from '@/modules/identity/domain/ports/password-hasher.port.js';
import { DeleteAccountCommand } from './delete-account.command.js';

/** Personal tables keyed by "userId": profile, health and safety settings, nutrition, preferences, devices, feedback. */
const PERSONAL_TABLES = [
  'UserAllergy', 'UserAllergyCategory', 'UserDietaryPreference', 'UserDislikedCategory', 'UserDislikedFood', 'UserHealthCondition',
  'UserFoodPreference', 'UserPreferredCuisine', 'UserPreference', 'UserGoal', 'UserProfile', 'UserWeightLog',
  'UserDailyNutrition', 'UserNutritionTrend', 'NotificationPreference', 'CookbookFeedback', 'UserDevice', 'SearchDocument',
  // Last: deleting the settings above appends history rows, which go too.
  'UserSafetyProfileEvent',
] as const;

/**
 * Deletes an account. Each household the person owns passes to its longest-standing other member, or is closed when
 * nobody else is in it. Their meals, notifications, health and safety data, preferences, devices and sessions are
 * removed. The user row is kept only as an anonymous placeholder, so shared household history (who added which food)
 * stays consistent without naming them. Sign-in with the old email, username or phone then fails.
 */
@CommandHandler(DeleteAccountCommand)
export class DeleteAccountHandler implements ICommandHandler<DeleteAccountCommand> {
  constructor(
    private readonly tx: TransactionRunner,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasherPort,
  ) {}

  async execute({ userId, password }: DeleteAccountCommand): Promise<void> {
    const user = (await this.tx.db.$queryRaw<Array<{ passwordHash: string }>>`SELECT "passwordHash" FROM "User" WHERE "id" = ${userId}::uuid AND "deletedAt" IS NULL`)[0];
    if (!user || !(await this.hasher.verify(user.passwordHash, password))) {
      throw new DomainError('INVALID_PASSWORD', 'That password is not right.', 403);
    }
    await this.tx.run(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.account_erasure', 'true', true)`;
      const memberships = await tx.$queryRaw<Array<{ householdId: string; role: string }>>`
        SELECT "householdId", "role"::text AS "role" FROM "HouseholdMember" WHERE "userId" = ${userId}::uuid AND "leftAt" IS NULL`;
      for (const { householdId, role } of memberships) await this.leave(tx, userId, householdId, role);
      await tx.$executeRaw`SELECT set_config('app.household_id', '', true)`;
      for (const table of PERSONAL_TABLES) await tx.$executeRawUnsafe(`DELETE FROM "${table}" WHERE "userId" = $1::uuid`, userId);
      await tx.$executeRaw`UPDATE "Session" SET "revokedAt" = now() WHERE "userId" = ${userId}::uuid AND "revokedAt" IS NULL`;
      await tx.$executeRaw`DELETE FROM "Token" WHERE "userId" = ${userId}::uuid`;
      await tx.$executeRaw`UPDATE "User" SET "email" = ${`deleted-${userId}@deleted.invalid`}, "username" = NULL, "phoneNumber" = NULL, "name" = 'Deleted user',
        "passwordHash" = 'deleted', "emailVerifiedAt" = NULL, "lastLoginAt" = NULL, "deletedAt" = now(), "updatedAt" = now() WHERE "id" = ${userId}::uuid`;
    }, { userId });
  }

  private async leave(tx: Tx, userId: string, householdId: string, role: string) {
    await tx.$executeRaw`SELECT set_config('app.household_id', ${householdId}, true)`;
    if (role === 'OWNER') {
      const next = (await tx.$queryRaw<Array<{ userId: string }>>`SELECT "userId" FROM "HouseholdMember"
        WHERE "householdId" = ${householdId}::uuid AND "leftAt" IS NULL AND "userId" <> ${userId}::uuid ORDER BY "joinedAt", "id" LIMIT 1`)[0];
      if (next) {
        // One active owner at a time: step down first, then hand over.
        await tx.$executeRaw`UPDATE "HouseholdMember" SET "role" = 'MEMBER' WHERE "householdId" = ${householdId}::uuid AND "userId" = ${userId}::uuid`;
        await tx.$executeRaw`UPDATE "HouseholdMember" SET "role" = 'OWNER' WHERE "householdId" = ${householdId}::uuid AND "userId" = ${next.userId}::uuid`;
      } else {
        await tx.$executeRaw`UPDATE "Household" SET "deletedAt" = now() WHERE "id" = ${householdId}::uuid`;
      }
    }
    await tx.$executeRaw`DELETE FROM "Meal" WHERE "householdId" = ${householdId}::uuid AND "userId" = ${userId}::uuid`;
    await tx.$executeRaw`DELETE FROM "Notification" WHERE "householdId" = ${householdId}::uuid AND "userId" = ${userId}::uuid`;
    await tx.$executeRaw`DELETE FROM "AIRecommendation" WHERE "householdId" = ${householdId}::uuid AND "userId" = ${userId}::uuid`;
    await tx.$executeRaw`DELETE FROM "AIPrediction" WHERE "householdId" = ${householdId}::uuid AND "userId" = ${userId}::uuid`;
    await tx.$executeRaw`UPDATE "HouseholdInvitation" SET "revokedAt" = now() WHERE "householdId" = ${householdId}::uuid AND "invitedByUserId" = ${userId}::uuid AND "acceptedAt" IS NULL AND "revokedAt" IS NULL`;
    await tx.$executeRaw`UPDATE "HouseholdMember" SET "leftAt" = now() WHERE "householdId" = ${householdId}::uuid AND "userId" = ${userId}::uuid`;
  }
}
