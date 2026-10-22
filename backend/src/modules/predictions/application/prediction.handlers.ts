import { Injectable, Logger, type OnApplicationShutdown, type OnApplicationBootstrap } from '@nestjs/common';
import { AppConfigService } from '@/platform/config/app-config.service.js';
import { OutboxHandler, type OutboxHandlerPort, type OutboxMessage } from '@/platform/outbox/outbox-handler.decorator.js';
import { PredictionService } from './prediction.service.js';
import { RecommendationService } from '@/modules/recommendations/application/recommendation.service.js';

type HouseholdPayload = { householdId: string };
type FreshnessPayload = HouseholdPayload & { inventoryItemId: string };

@Injectable()
@OutboxHandler('prediction.food_depletion.requested')
export class FoodDepletionHandler implements OutboxHandlerPort<HouseholdPayload> {
  constructor(private readonly predictions: PredictionService, private readonly recommendations: RecommendationService) {}
  async handle(message: OutboxMessage<HouseholdPayload>): Promise<void> {
    const householdId = message.householdId ?? message.payload.householdId;
    if (!householdId) throw new Error('Food depletion event has no household id.');
    await this.predictions.generateFoodDepletion(householdId);
    await this.recommendations.generate(householdId);
  }
}

@Injectable()
@OutboxHandler('prediction.freshness.recompute')
export class FreshnessHandler implements OutboxHandlerPort<FreshnessPayload> {
  constructor(private readonly predictions: PredictionService) {}
  handle(message: OutboxMessage<FreshnessPayload>): Promise<void> {
    const { householdId, inventoryItemId } = message.payload;
    if (!householdId || !inventoryItemId) throw new Error('Freshness event is incomplete.');
    return this.predictions.recomputeFreshness(householdId, inventoryItemId);
  }
}

@Injectable()
export class PredictionMaintenanceJob implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(PredictionMaintenanceJob.name);
  private timer?: NodeJS.Timeout;
  private stopping = false;

  constructor(private readonly predictions: PredictionService, private readonly config: AppConfigService) {}

  onApplicationBootstrap(): void {
    if (!this.config.runsBackgroundJobs) return;
    this.timer = setInterval(() => {
      if (this.stopping) return;
      void this.runMaintenance();
    }, 24 * 60 * 60 * 1000);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
  }

  private async runMaintenance(): Promise<void> {
    try {
      while (await this.predictions.purgeExpired() === 500) { /* continue the bounded TTL batches */ }
      while (await this.predictions.refreshExpiredFreshness() === 500) { /* continue the bounded cache refresh batches */ }
    } catch (error) {
      this.logger.error(`prediction maintenance failed: ${(error as Error).message}`);
    }
  }
}
