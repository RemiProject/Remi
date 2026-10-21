import { Module } from '@nestjs/common';
import { SafetyModule } from '@/modules/safety/safety.module.js';
import { RecommendationGenerateHandler, RecommendationMaintenanceJob, RecommendationSafetyHandler, SafetyProfileChangedHandler } from './application/recommendation.handlers.js';
import { RecommendationService } from './application/recommendation.service.js';
import { RecommendationResolver } from './presentation/recommendation.resolver.js';

@Module({
  imports: [SafetyModule],
  providers: [RecommendationService, RecommendationResolver, RecommendationGenerateHandler, RecommendationSafetyHandler, SafetyProfileChangedHandler, RecommendationMaintenanceJob],
  exports: [RecommendationService],
})
export class RecommendationsModule {}
