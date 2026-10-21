import { Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { OutboxHandler, type OutboxHandlerPort, type OutboxMessage } from '@/platform/outbox/outbox-handler.decorator.js';
import { RecommendationService } from './recommendation.service.js';

type HouseholdPayload = { householdId: string };
type SafetyPayload = { recommendationId: string; householdId: string };

@Injectable()
@OutboxHandler('recommendation.generate.requested')
export class RecommendationGenerateHandler implements OutboxHandlerPort<HouseholdPayload> {
  constructor(private readonly recommendations: RecommendationService) {}
  handle(message: OutboxMessage<HouseholdPayload>): Promise<void> {
    const householdId = message.householdId ?? message.payload.householdId;
    if (!householdId) throw new Error('Recommendation request has no household id.');
    return this.recommendations.generate(householdId);
  }
}

@Injectable()
@OutboxHandler('recommendation.safety.requested')
export class RecommendationSafetyHandler implements OutboxHandlerPort<SafetyPayload> {
  constructor(private readonly recommendations: RecommendationService) {}
  handle(message: OutboxMessage<SafetyPayload>): Promise<void> {
    const { recommendationId, householdId } = message.payload;
    if (!recommendationId || !householdId) throw new Error('Safety check request is incomplete.');
    return this.recommendations.runSafety(recommendationId, householdId);
  }
}

@Injectable()
@OutboxHandler('safety.profile.changed')
export class SafetyProfileChangedHandler implements OutboxHandlerPort<{ userId: string }> {
  constructor(private readonly recommendations: RecommendationService) {}
  async handle(message: OutboxMessage<{ userId: string }>): Promise<void> {
    const userId = message.payload.userId;
    if (!userId) throw new Error('Safety profile event has no user id.');
    const householdIds = await this.recommendations.householdsForUser(userId);
    for (const householdId of householdIds) await this.recommendations.recheckUser(householdId, userId);
  }
}

@Injectable()
export class RecommendationMaintenanceJob implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(RecommendationMaintenanceJob.name);
  private timer?: NodeJS.Timeout;
  private stopping = false;
  constructor(private readonly recommendations: RecommendationService) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => { if (!this.stopping) void this.run(); }, 60 * 60 * 1000);
    this.timer.unref();
    void this.run();
  }

  onApplicationShutdown(): void { this.stopping = true; if (this.timer) clearInterval(this.timer); }

  private async run(): Promise<void> {
    try {
      while (await this.recommendations.expireBatch() === 500) { /* bounded TTL batches */ }
      while (await this.recommendations.foldFeedbackBatch() === 500) { /* bounded feedback batches */ }
    } catch (error) { this.logger.error(`recommendation maintenance failed: ${(error as Error).message}`); }
  }
}
