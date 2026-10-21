import { Injectable } from '@nestjs/common';
import { DomainError } from '@/shared/domain-error.js';
import { TransactionRunner } from '@/platform/db/transaction-runner.js';

type PredictionRow = { id: string; foodId: string; foodName: string; currentQty: string; unit: string; avgDailyQty: string; daysLeft: string; runOutAt: Date; confidence: string; modelVersion: string; generatedAt: Date; expiresAt: Date };

@Injectable()
export class PredictionQueryService {
  constructor(private readonly transactions: TransactionRunner) {}

  async listFoodDepletion(householdId: string, first = 20, after?: string) {
    if (first < 1 || first > 50) throw new DomainError('INVALID_PAGE_SIZE', 'first must be between 1 and 50.');
    const cursor = after ? decodeCursor(after) : null;
    return this.transactions.run(async (tx) => {
      const rows = await tx.$queryRaw<PredictionRow[]>`
        SELECT p."id", d."foodId", f."name" AS "foodName", d."currentQty"::text AS "currentQty", d."unit"::text AS "unit",
               d."avgDailyQty"::text AS "avgDailyQty", d."daysLeft"::text AS "daysLeft", d."runOutAt",
               p."confidence"::text AS "confidence", p."modelVersion", p."generatedAt", p."expiresAt"
        FROM "AIPrediction" p JOIN "AIFoodDepletionPrediction" d ON d."predictionId" = p."id"
        JOIN "Food" f ON f."id" = d."foodId"
        WHERE p."householdId" = ${householdId}::uuid AND p."predictionType" = 'FOOD_DEPLETION' AND p."expiresAt" > now()
          AND (${cursor?.generatedAt ?? null}::timestamptz IS NULL OR (p."generatedAt", p."id") < (${cursor?.generatedAt ?? null}::timestamptz, ${cursor?.id ?? null}::uuid))
        ORDER BY p."generatedAt" DESC, p."id" DESC LIMIT ${first + 1}`;
      const nodes = rows.slice(0, first);
      return { nodes, hasNextPage: rows.length > first, endCursor: nodes.length ? encodeCursor(nodes[nodes.length - 1]) : null };
    }, { householdId });
  }

  async stockForecast(householdId: string, foodId: string) {
    return this.transactions.run((tx) => tx.$queryRaw<Array<Record<string, unknown>>>`
      SELECT p."id", d."foodId", f."name" AS "foodName", d."currentQty"::text AS "currentQty", d."unit"::text AS "unit",
             d."avgDailyQty"::text AS "avgDailyQty", d."daysLeft"::text AS "daysLeft", d."runOutAt",
             p."confidence"::text AS "confidence", p."modelVersion", p."generatedAt", p."expiresAt"
      FROM "AIPrediction" p JOIN "AIFoodDepletionPrediction" d ON d."predictionId" = p."id" JOIN "Food" f ON f."id" = d."foodId"
      WHERE p."householdId" = ${householdId}::uuid AND d."foodId" = ${foodId}::uuid AND p."predictionType" = 'FOOD_DEPLETION' AND p."expiresAt" > now()
      ORDER BY p."generatedAt" DESC LIMIT 1` , { householdId });
  }
}

function encodeCursor(row: { id: string; generatedAt: Date }): string {
  return Buffer.from(JSON.stringify({ id: row.id, generatedAt: row.generatedAt.toISOString() })).toString('base64url');
}

function decodeCursor(value: string): { id: string; generatedAt: string } {
  try {
    const decoded = Buffer.from(value, 'base64url').toString();
    const cursor = JSON.parse(decoded) as { id?: string; generatedAt?: string };
    if (Buffer.from(decoded).toString('base64url') !== value || !cursor.id || !/^[0-9a-f-]{36}$/i.test(cursor.id) || !cursor.generatedAt || Number.isNaN(Date.parse(cursor.generatedAt))) throw new Error();
    return { id: cursor.id, generatedAt: cursor.generatedAt };
  } catch { throw new DomainError('INVALID_CURSOR', 'The prediction cursor is invalid.'); }
}
