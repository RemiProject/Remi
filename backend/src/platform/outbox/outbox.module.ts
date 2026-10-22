import { Global, Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { OutboxHandlerRegistry } from './outbox-handler.registry.js';
import { OutboxPoller } from './outbox.poller.js';
import { OutboxPublisher } from './outbox.publisher.js';

@Global()
@Module({
  imports: [DiscoveryModule],
  providers: [OutboxPublisher, OutboxHandlerRegistry, OutboxPoller],
  exports: [OutboxPublisher, OutboxPoller],
})
export class OutboxModule {}
