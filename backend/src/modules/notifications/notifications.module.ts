import { Module } from '@nestjs/common';
import { DbModule } from '@/platform/db/db.module.js';
import { ConfigModule } from '@/platform/config/config.module.js';
import { MailModule } from '@/platform/mail/mail.module.js';
import { NotificationDeliveryWorker } from './application/notification-delivery.worker.js';
import { EmailDeliveryChannel, PushDeliveryChannel } from './application/delivery-channel.js';
import { NotificationEvents } from './application/notification-events.js';
import { NotificationFactory } from './application/notification.factory.js';
import { NotificationService } from './application/notification.service.js';
import { NotificationResolver } from './presentation/notification.resolver.js';

@Module({
  imports: [DbModule, MailModule, ConfigModule],
  providers: [NotificationFactory, NotificationService, NotificationResolver, NotificationEvents, NotificationDeliveryWorker, EmailDeliveryChannel, PushDeliveryChannel],
  exports: [NotificationFactory, NotificationService],
})
export class NotificationsModule {}
