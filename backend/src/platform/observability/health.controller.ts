import { Controller, Get, Headers, NotFoundException, Res, UnauthorizedException, ServiceUnavailableException } from '@nestjs/common';
import type { Response } from 'express';
import { SkipThrottle } from '@nestjs/throttler';
import { timingSafeEqual } from 'node:crypto';
import { AppConfigService } from '@/platform/config/app-config.service.js';
import { PrismaService } from '@/platform/db/prisma.service.js';
import { MetricsService } from './metrics.service.js';

@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService, private readonly metrics: MetricsService, private readonly config: AppConfigService) {}

  @Get('live')
  live() {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok' };
    } catch {
      throw new ServiceUnavailableException({ status: 'db_unavailable' });
    }
  }

  @SkipThrottle()
  @Get('metrics')
  metricsEndpoint(@Headers('authorization') authorization: string | undefined, @Res({ passthrough: true }) response: Response) {
    if (!this.config.env.METRICS_ENABLED || !this.config.env.METRICS_TOKEN) throw new NotFoundException();
    const supplied = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
    const expected = this.config.env.METRICS_TOKEN;
    const suppliedBytes = Buffer.from(supplied);
    const expectedBytes = Buffer.from(expected);
    if (suppliedBytes.length !== expectedBytes.length || !timingSafeEqual(suppliedBytes, expectedBytes)) throw new UnauthorizedException();
    response.setHeader('content-type', 'text/plain; version=0.0.4; charset=utf-8');
    return this.metrics.renderPrometheus();
  }
}
