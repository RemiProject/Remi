import { Module } from '@nestjs/common';
import { UnitsModule } from '@/modules/units/units.module.js';
import { RecommendationsModule } from '@/modules/recommendations/recommendations.module.js';
import { FoodDepletionHandler, FreshnessHandler, PredictionMaintenanceJob } from './application/prediction.handlers.js';
import { PredictionQueryService } from './application/prediction.query-service.js';
import { PredictionService } from './application/prediction.service.js';
import { PredictionResolver } from './presentation/prediction.resolver.js';

@Module({
  imports: [UnitsModule, RecommendationsModule],
  providers: [PredictionService, PredictionQueryService, FoodDepletionHandler, FreshnessHandler, PredictionMaintenanceJob, PredictionResolver],
})
export class PredictionsModule {}
