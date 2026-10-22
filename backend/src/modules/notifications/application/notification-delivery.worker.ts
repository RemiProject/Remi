import { Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { AppConfigService } from '@/platform/config/app-config.service.js';
import { PrismaService } from '@/platform/db/prisma.service.js';
import { EmailDeliveryChannel, NotificationProviderUnavailableError, PushDeliveryChannel, UnregisteredPushTokenError, type NotificationDeliveryInput } from './delivery-channel.js';

@Injectable()
export class NotificationDeliveryWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(NotificationDeliveryWorker.name);
  private timer?: NodeJS.Timeout;
  private stopping = false;
  private running: Promise<void> = Promise.resolve();

  constructor(private readonly prisma: PrismaService, private readonly email: EmailDeliveryChannel, private readonly push: PushDeliveryChannel, private readonly config: AppConfigService) {}

  onApplicationBootstrap(): void { if (this.config.runsBackgroundJobs) this.schedule(); }
  async onApplicationShutdown(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearTimeout(this.timer);
    await this.running;
  }

  private schedule(): void {
    if (this.stopping) return;
    this.timer = setTimeout(() => {
      this.running = this.tick().then(() => undefined).catch((error) => this.logger.error(`Notification delivery pass failed: ${(error as Error).message}`)).finally(() => this.schedule());
    }, 3000);
  }

  async tick(): Promise<number> {
    await this.prisma.$queryRaw`SELECT notification_expiry_generate(100)`;
    const rows = await this.prisma.$queryRaw<NotificationDeliveryInput[]>`SELECT * FROM notification_delivery_claim(20)`;
    for (const row of rows) {
      if (this.stopping) break;
      await this.deliver(row);
    }
    return rows.length;
  }

  private async deliver(row: NotificationDeliveryInput): Promise<void> {
    try {
      await (row.channel === 'EMAIL' ? this.email : this.push).send(row);
      await this.prisma.$executeRaw`SELECT notification_delivery_sent(${row.id}::uuid)`;
    } catch (error) {
      if (error instanceof UnregisteredPushTokenError && row.deviceId) {
        await this.prisma.$executeRaw`SELECT notification_device_unregistered(${row.id}::uuid, ${row.deviceId}::uuid)`;
        return;
      }
      const code = error instanceof NotificationProviderUnavailableError ? error.code : 'provider_error';
      await this.prisma.$executeRaw`SELECT notification_delivery_failed(${row.id}::uuid, ${code}, false)`;
      this.logger.warn(`Delivery ${row.id} (${row.channel}) attempt ${row.attempts} failed: ${code}`);
    }
  }

}
