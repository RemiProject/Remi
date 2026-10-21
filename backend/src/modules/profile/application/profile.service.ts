import { Injectable } from '@nestjs/common';
import { DomainError } from '@/shared/domain-error.js';
import { newId } from '@/shared/ids.js';
import { TransactionRunner } from '@/platform/db/transaction-runner.js';
import { NotesCipher } from '@/modules/safety/infrastructure/notes-cipher.js';
import { SafetyProfileLoader } from '@/modules/safety/application/safety-profile.loader.js';

export type GoalTypeValue = 'LOSE_WEIGHT' | 'GAIN_MUSCLE' | 'MAINTAIN' | 'CUSTOM';
export type AllergySeverityValue = 'MILD' | 'MODERATE' | 'SEVERE' | 'LIFE_THREATENING';
export type ConditionStatusValue = 'ACTIVE' | 'CONTROLLED' | 'REMISSION' | 'RESOLVED';

export interface UpdateProfileInput {
  heightCm?: string | null; weightKg?: string | null; birthDate?: string | null;
  gender?: string | null; activityLevel?: string | null;
}
export interface SetGoalInput { goalType: GoalTypeValue; targetWeightKg?: string | null; calorieTarget?: number | null; proteinTargetG?: number | null }
export interface AllergyInput { foodId?: string; categoryId?: string; severity: AllergySeverityValue; notes?: string | null }
export interface HealthConditionInput { healthConditionId: string; status: ConditionStatusValue; diagnosedAt?: string | null; notes?: string | null }

@Injectable()
export class ProfileService {
  constructor(private readonly transactions: TransactionRunner, private readonly notes: NotesCipher, private readonly safetyProfile: SafetyProfileLoader) {}

  async myProfile(userId: string) {
    return this.transactions.run(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ data: Record<string, any> }>>`
        SELECT jsonb_build_object(
          'userId', ${userId}::text,
          'profile', (SELECT jsonb_build_object('heightCm', p."heightCm"::text, 'weightKg', p."weightKg"::text, 'birthDate', p."birthDate", 'gender', p."gender"::text, 'activityLevel', p."activityLevel"::text) FROM "UserProfile" p WHERE p."userId" = ${userId}::uuid),
          'goal', (SELECT jsonb_build_object('goalType', g."goalType"::text, 'targetWeightKg', g."targetWeightKg"::text, 'calorieTarget', g."calorieTarget", 'proteinTargetG', g."proteinTargetG", 'startedAt', g."startedAt", 'endedAt', g."endedAt") FROM "UserGoal" g WHERE g."userId" = ${userId}::uuid AND g."endedAt" IS NULL),
          'preferences', (SELECT jsonb_build_object('preferredDifficulty', p."preferredDifficulty"::text, 'maxPrepTimeMin', p."maxPrepTimeMin") FROM "UserPreference" p WHERE p."userId" = ${userId}::uuid),
          'dietaryPreferences', COALESCE((SELECT jsonb_agg("dietaryPreference"::text ORDER BY "dietaryPreference") FROM "UserDietaryPreference" WHERE "userId" = ${userId}::uuid), '[]'::jsonb),
          'preferredCuisines', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', c."id", 'code', c."code", 'name', c."name") ORDER BY c."name") FROM "UserPreferredCuisine" uc JOIN "Cuisine" c ON c."id" = uc."cuisineId" WHERE uc."userId" = ${userId}::uuid), '[]'::jsonb),
          'dislikedFoodIds', COALESCE((SELECT jsonb_agg("foodId"::text) FROM "UserDislikedFood" WHERE "userId" = ${userId}::uuid), '[]'::jsonb),
          'dislikedCategoryIds', COALESCE((SELECT jsonb_agg("categoryId"::text) FROM "UserDislikedCategory" WHERE "userId" = ${userId}::uuid), '[]'::jsonb),
          'allergies', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', a."id", 'foodId', a."foodId", 'foodName', f."name", 'severity', a."severity"::text, 'notes', a."notes")) FROM "UserAllergy" a JOIN "Food" f ON f."id" = a."foodId" WHERE a."userId" = ${userId}::uuid), '[]'::jsonb),
          'allergyCategories', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', a."id", 'categoryId', a."categoryId", 'categoryName', c."name", 'severity', a."severity"::text)) FROM "UserAllergyCategory" a JOIN "FoodCategory" c ON c."id" = a."categoryId" WHERE a."userId" = ${userId}::uuid), '[]'::jsonb),
          'healthConditions', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', hc."id", 'healthConditionId', hc."healthConditionId", 'code', c."code", 'name', c."name", 'status', hc."status"::text, 'diagnosedAt', hc."diagnosedAt", 'notes', hc."notes")) FROM "UserHealthCondition" hc JOIN "HealthCondition" c ON c."id" = hc."healthConditionId" WHERE hc."userId" = ${userId}::uuid), '[]'::jsonb)
        ) AS data`;
      const data = rows[0].data;
      data.allergies = data.allergies.map((row: any) => ({ ...row, notes: this.notes.decrypt(row.notes, 'UserAllergy', row.id, userId) }));
      data.healthConditions = data.healthConditions.map((row: any) => ({ ...row, notes: this.notes.decrypt(row.notes, 'UserHealthCondition', row.id, userId) }));
      return data;
    }, { userId });
  }

  async updateProfile(userId: string, input: UpdateProfileInput) {
    return this.transactions.run(async (tx) => {
      const current = await tx.$queryRaw<Array<{ id: string; weightKg: string | null }>>`SELECT "id", "weightKg"::text AS "weightKg" FROM "UserProfile" WHERE "userId" = ${userId}::uuid FOR UPDATE`;
      const profileId = current[0]?.id ?? newId();
      const nextWeight = input.weightKg === undefined ? current[0]?.weightKg ?? null : input.weightKg;
      const row = await tx.$queryRaw<Array<Record<string, unknown>>>`INSERT INTO "UserProfile" ("id", "userId", "heightCm", "weightKg", "birthDate", "gender", "activityLevel") VALUES (${profileId}::uuid, ${userId}::uuid, ${input.heightCm ?? null}::numeric, ${nextWeight}::numeric, ${input.birthDate ?? null}::date, ${input.gender ?? null}::"Gender", ${input.activityLevel ?? null}::"ActivityLevel") ON CONFLICT ("userId") DO UPDATE SET "heightCm" = COALESCE(${input.heightCm ?? null}::numeric, "UserProfile"."heightCm"), "weightKg" = COALESCE(${nextWeight}::numeric, "UserProfile"."weightKg"), "birthDate" = COALESCE(${input.birthDate ?? null}::date, "UserProfile"."birthDate"), "gender" = COALESCE(${input.gender ?? null}::"Gender", "UserProfile"."gender"), "activityLevel" = COALESCE(${input.activityLevel ?? null}::"ActivityLevel", "UserProfile"."activityLevel"), "updatedAt" = now() RETURNING "heightCm"::text AS "heightCm", "weightKg"::text AS "weightKg", "birthDate", "gender"::text AS "gender", "activityLevel"::text AS "activityLevel"`;
      if (input.weightKg !== undefined && input.weightKg !== null && current[0]?.weightKg !== input.weightKg) {
        await tx.$executeRaw`INSERT INTO "UserWeightLog" ("id", "userId", "weightKg") VALUES (${newId()}::uuid, ${userId}::uuid, ${input.weightKg}::numeric)`;
      }
      return row[0];
    }, { userId });
  }

  async setGoal(userId: string, input: SetGoalInput) {
    return this.transactions.run(async (tx) => {
      await tx.$executeRaw`UPDATE "UserGoal" SET "endedAt" = now() WHERE "userId" = ${userId}::uuid AND "endedAt" IS NULL`;
      const rows = await tx.$queryRaw<Array<Record<string, unknown>>>`INSERT INTO "UserGoal" ("id", "userId", "goalType", "targetWeightKg", "calorieTarget", "proteinTargetG") VALUES (${newId()}::uuid, ${userId}::uuid, ${input.goalType}::"GoalType", ${input.targetWeightKg ?? null}::numeric, ${input.calorieTarget ?? null}, ${input.proteinTargetG ?? null}) RETURNING "goalType"::text AS "goalType", "targetWeightKg"::text AS "targetWeightKg", "calorieTarget", "proteinTargetG", "startedAt", "endedAt"`;
      return rows[0];
    }, { userId });
  }

  async addAllergy(userId: string, input: AllergyInput) {
    const isFood = !!input.foodId;
    if (isFood === !!input.categoryId) throw new DomainError('INVALID_ALLERGY_TARGET', 'Provide exactly one of foodId or categoryId.');
    return this.transactions.run(async (tx) => {
      const id = newId();
      if (isFood) {
        const encryptedNotes = this.notes.encrypt(input.notes, 'UserAllergy', id, userId);
        const rows = await tx.$queryRaw<Array<Record<string, unknown>>>`INSERT INTO "UserAllergy" ("id", "userId", "foodId", "severity", "notes") VALUES (${id}::uuid, ${userId}::uuid, ${input.foodId}::uuid, ${input.severity}::"AllergySeverity", ${encryptedNotes}) RETURNING "id", "foodId", "severity"::text AS "severity"`;
        return rows[0];
      }
      const rows = await tx.$queryRaw<Array<Record<string, unknown>>>`INSERT INTO "UserAllergyCategory" ("id", "userId", "categoryId", "severity") VALUES (${id}::uuid, ${userId}::uuid, ${input.categoryId}::uuid, ${input.severity}::"AllergySeverity") RETURNING "id", "categoryId", "severity"::text AS "severity"`;
      return rows[0];
    }, { userId });
  }

  async removeAllergy(userId: string, input: { foodId?: string; categoryId?: string }): Promise<boolean> {
    const isFood = !!input.foodId;
    if (isFood === !!input.categoryId) throw new DomainError('INVALID_ALLERGY_TARGET', 'Provide exactly one of foodId or categoryId.');
    return this.transactions.run(async (tx) => {
      const rows = isFood
        ? await tx.$queryRaw<Array<{ id: string }>>`DELETE FROM "UserAllergy" WHERE "userId" = ${userId}::uuid AND "foodId" = ${input.foodId}::uuid RETURNING "id"`
        : await tx.$queryRaw<Array<{ id: string }>>`DELETE FROM "UserAllergyCategory" WHERE "userId" = ${userId}::uuid AND "categoryId" = ${input.categoryId}::uuid RETURNING "id"`;
      return rows.length > 0;
    }, { userId });
  }

  async setHealthConditions(userId: string, conditions: HealthConditionInput[]) {
    const seen = new Set<string>();
    for (const condition of conditions) {
      if (seen.has(condition.healthConditionId)) throw new DomainError('DUPLICATE_HEALTH_CONDITION', 'A health condition can only be included once.');
      seen.add(condition.healthConditionId);
    }
    await this.transactions.run(async (tx) => {
      await tx.$queryRaw`SELECT safety_lock(ARRAY[${userId}::uuid]) IS NULL AS "locked"`;
      const existing = await tx.$queryRaw<Array<{ id: string; healthConditionId: string }>>`SELECT "id", "healthConditionId" FROM "UserHealthCondition" WHERE "userId" = ${userId}::uuid FOR UPDATE`;
      const remove = existing.filter((row) => !seen.has(row.healthConditionId)).map((row) => row.healthConditionId);
      if (remove.length) await tx.$executeRaw`DELETE FROM "UserHealthCondition" WHERE "userId" = ${userId}::uuid AND "healthConditionId" = ANY(${remove}::uuid[])`;
      const existingIds = new Map(existing.map((row) => [row.healthConditionId, row.id]));
      const payload = conditions.map((condition) => {
        const id = existingIds.get(condition.healthConditionId) ?? newId();
        return { id, healthConditionId: condition.healthConditionId, status: condition.status, diagnosedAt: condition.diagnosedAt ?? null, notes: this.notes.encrypt(condition.notes, 'UserHealthCondition', id, userId) };
      });
      if (payload.length) await tx.$executeRaw`INSERT INTO "UserHealthCondition" ("id", "userId", "healthConditionId", "status", "diagnosedAt", "notes") SELECT x."id"::uuid, ${userId}::uuid, x."healthConditionId"::uuid, x."status"::"ConditionStatus", x."diagnosedAt"::date, x."notes" FROM jsonb_to_recordset(${JSON.stringify(payload)}::jsonb) AS x("id" text, "healthConditionId" text, "status" text, "diagnosedAt" text, "notes" text) ON CONFLICT ("userId", "healthConditionId") DO UPDATE SET "status" = EXCLUDED."status", "diagnosedAt" = EXCLUDED."diagnosedAt", "notes" = EXCLUDED."notes", "updatedAt" = now()`;
    }, { userId });
    return this.myProfile(userId);
  }

  async setDietaryPreferences(userId: string, preferences: string[]) {
    if (new Set(preferences).size !== preferences.length) throw new DomainError('DUPLICATE_DIETARY_PREFERENCE', 'Dietary preferences must not contain duplicates.');
    await this.transactions.run(async (tx) => {
      await tx.$queryRaw`SELECT safety_lock(ARRAY[${userId}::uuid]) IS NULL AS "locked"`;
      await tx.$executeRaw`DELETE FROM "UserDietaryPreference" WHERE "userId" = ${userId}::uuid AND NOT ("dietaryPreference"::text = ANY(${preferences}::text[]))`;
      const payload = preferences.map((dietaryPreference) => ({ id: newId(), dietaryPreference }));
      if (payload.length) await tx.$executeRaw`INSERT INTO "UserDietaryPreference" ("id", "userId", "dietaryPreference") SELECT x."id"::uuid, ${userId}::uuid, x."dietaryPreference"::"DietaryPreference" FROM jsonb_to_recordset(${JSON.stringify(payload)}::jsonb) AS x("id" text, "dietaryPreference" text) ON CONFLICT ("userId", "dietaryPreference") DO NOTHING`;
    }, { userId });
    return this.myProfile(userId);
  }

  async healthConditionCatalog() {
    return this.transactions.run((tx) => tx.$queryRaw<Array<Record<string, unknown>>>`SELECT "id", "code", "name", "conditionGroup"::text AS "conditionGroup", "isChronic" FROM "HealthCondition" WHERE "archivedAt" IS NULL ORDER BY "name"`);
  }

  async mySafetyHistory(userId: string, first = 20, after?: string) {
    if (first < 1 || first > 50) throw new DomainError('INVALID_PAGE_SIZE', 'first must be between 1 and 50.');
    const cursor = after ? decodeHistoryCursor(after) : null;
    return this.transactions.run(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; entityType: string; entityId: string; action: string; snapshot: unknown; occurredAt: Date }>>`
        SELECT "id", "entityType"::text AS "entityType", "entityId", "action"::text AS "action", "snapshot", "occurredAt"
        FROM "UserSafetyProfileEvent" WHERE "userId" = ${userId}::uuid
          AND (${cursor?.occurredAt ?? null}::timestamptz IS NULL OR ("occurredAt", "id") < (${cursor?.occurredAt ?? null}::timestamptz, ${cursor?.id ?? null}::uuid))
        ORDER BY "occurredAt" DESC, "id" DESC LIMIT ${first + 1}`;
      const nodes = rows.slice(0, first).map((row) => ({ ...row, details: JSON.stringify(row.snapshot) }));
      return { nodes, hasNextPage: rows.length > first, endCursor: nodes.length ? encodeHistoryCursor(nodes[nodes.length - 1]) : null };
    }, { userId });
  }

}

function encodeHistoryCursor(row: { id: string; occurredAt: Date }): string { return Buffer.from(JSON.stringify({ id: row.id, occurredAt: row.occurredAt.toISOString() })).toString('base64url'); }
function decodeHistoryCursor(value: string): { id: string; occurredAt: string } {
  try {
    const decoded = Buffer.from(value, 'base64url').toString();
    const cursor = JSON.parse(decoded) as { id?: string; occurredAt?: string };
    if (Buffer.from(decoded).toString('base64url') !== value || !cursor.id || !/^[0-9a-f-]{36}$/i.test(cursor.id) || !cursor.occurredAt || Number.isNaN(Date.parse(cursor.occurredAt))) throw new Error();
    return { id: cursor.id, occurredAt: cursor.occurredAt };
  } catch { throw new DomainError('INVALID_CURSOR', 'The safety history cursor is invalid.'); }
}
