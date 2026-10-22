import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { DiscoveryService, Reflector } from '@nestjs/core';
import { OUTBOX_HANDLER_TOPIC, type OutboxHandlerPort } from './outbox-handler.decorator.js';

@Injectable()
export class OutboxHandlerRegistry implements OnModuleInit {
  private readonly logger = new Logger(OutboxHandlerRegistry.name);
  private readonly handlers = new Map<string, OutboxHandlerPort>();

  constructor(
    private readonly discovery: DiscoveryService,
    private readonly reflector: Reflector,
  ) {}

  onModuleInit(): void {
    for (const wrapper of this.discovery.getProviders()) {
      const { instance, metatype } = wrapper;
      if (!instance || !metatype) continue;
      const topic = this.reflector.get<string | undefined>(OUTBOX_HANDLER_TOPIC, metatype);
      if (!topic) continue;
      if (this.handlers.has(topic)) throw new Error(`Duplicate outbox handler for topic "${topic}"`);
      this.handlers.set(topic, instance as OutboxHandlerPort);
    }
    this.logger.log(`Registered outbox topics: ${[...this.handlers.keys()].join(', ') || '(none)'}`);
  }

  topics(): string[] {
    return [...this.handlers.keys()];
  }

  get(topic: string): OutboxHandlerPort | undefined {
    return this.handlers.get(topic);
  }
}
