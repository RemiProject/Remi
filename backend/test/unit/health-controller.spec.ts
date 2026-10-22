import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { HealthController } from '@/platform/observability/health.controller.js';
import { MetricsService } from '@/platform/observability/metrics.service.js';

describe('health metrics endpoint', () => {
  it('stays hidden until enabled and token-protected', () => {
    const metrics = new MetricsService();
    const response = { setHeader: vi.fn() };
    const disabled = new HealthController({} as never, metrics, { env: { METRICS_ENABLED: false } } as never);
    expect(() => disabled.metricsEndpoint(undefined, response as never)).toThrow(NotFoundException);

    const token = 'm'.repeat(32);
    const enabled = new HealthController({} as never, metrics, { env: { METRICS_ENABLED: true, METRICS_TOKEN: token } } as never);
    expect(() => enabled.metricsEndpoint('Bearer wrong', response as never)).toThrow(UnauthorizedException);
    const output = enabled.metricsEndpoint(`Bearer ${token}`, response as never);
    expect(response.setHeader).toHaveBeenCalledWith('content-type', 'text/plain; version=0.0.4; charset=utf-8');
    expect(output).toContain('ai_kitchen_graphql_requests_total');
  });
});
