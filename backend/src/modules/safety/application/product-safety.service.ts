import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '@/platform/db/transaction-runner.js';
import { SafetyEvaluator, type SafetyFilter, type SafetyIngredient } from '@/modules/safety/domain/safety-evaluator.js';
import { SafetyProfileLoader } from './safety-profile.loader.js';

type ProductRow = {
  productId: string; productName: string; brand: string | null; barcode: string;
  foodId: string; foodName: string; categoryIds: string[]; mayContainCategoryIds: string[];
  nutrientsPer100g: SafetyIngredient['nutrientsPer100g'];
};

export type ProductSafetyStatus = 'SAFE' | 'WARNING' | 'UNSAFE';

/** "Is this packaged product safe for me?" Scan a barcode, evaluate food categories + label tags against the caller's profile. */
@Injectable()
export class ProductSafetyService {
  constructor(
    private readonly transactions: TransactionRunner,
    private readonly profiles: SafetyProfileLoader,
    private readonly evaluator: SafetyEvaluator,
  ) {}

  async checkBarcode(userId: string, barcode: string) {
    return this.transactions.run(async (tx) => {
      const rows = await tx.$queryRaw<ProductRow[]>`
        SELECT p.id AS "productId", p.name AS "productName", p.brand, p.barcode, f.id AS "foodId", f.name AS "foodName",
          ARRAY(SELECT unnest(food_safety_category_ids(f.id))::text
                UNION SELECT t."categoryId"::text FROM "ProductSafetyTag" t WHERE t."productId" = p.id AND t.kind = 'CONTAINS') AS "categoryIds",
          ARRAY(SELECT t."categoryId"::text FROM "ProductSafetyTag" t WHERE t."productId" = p.id AND t.kind = 'MAY_CONTAIN') AS "mayContainCategoryIds",
          jsonb_strip_nulls(jsonb_build_object('CALORIES', n."caloriesPer100g", 'PROTEIN', n."proteinG", 'CARBS', n."carbsG", 'FAT', n."fatG", 'FIBER', n."fiberG", 'SUGAR', n."sugarG", 'SODIUM', n."sodiumMg")) AS "nutrientsPer100g"
        FROM "Product" p JOIN "Food" f ON f.id = p."foodId" LEFT JOIN "NutritionProfile" n ON n."foodId" = f.id
        WHERE p.barcode = ${barcode} AND p."archivedAt" IS NULL AND f."archivedAt" IS NULL`;
      const product = rows[0];
      if (!product) return null;

      const profile = await this.profiles.loadInTransaction(tx, userId);
      const verdicts = this.evaluator.evaluate(profile, [{
        foodId: product.foodId, categoryIds: product.categoryIds,
        mayContainCategoryIds: product.mayContainCategoryIds, nutrientsPer100g: product.nutrientsPer100g ?? {},
      }]);
      const failed: SafetyFilter[] = verdicts.filter((v) => v.result === 'FAILED').map((v) => v.filterType);
      const warned: SafetyFilter[] = verdicts.filter((v) => v.result === 'WARNED').map((v) => v.filterType);
      const status: ProductSafetyStatus = failed.length ? 'UNSAFE' : warned.length ? 'WARNING' : 'SAFE';
      const { categoryIds: _c, mayContainCategoryIds: _m, nutrientsPer100g: _n, ...info } = product;
      return { ...info, status, failedFilters: failed, warnedFilters: warned };
    }, { userId });
  }
}
