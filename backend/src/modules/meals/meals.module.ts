import { Module } from '@nestjs/common';
import { InventoryModule } from '@/modules/inventory/inventory.module.js';
import { UnitsModule } from '@/modules/units/units.module.js';
import { DailyNutritionProjector } from './application/daily-nutrition.projector.js';
import { MealLoggingService } from './application/meal-logging.service.js';
import { MealPlanService } from './application/meal-plan.service.js';
import { MealResolver } from './presentation/meal.resolver.js';

@Module({
  imports: [InventoryModule, UnitsModule],
  providers: [MealLoggingService, MealPlanService, DailyNutritionProjector, MealResolver],
  exports: [MealLoggingService, MealPlanService],
})
export class MealsModule {}
