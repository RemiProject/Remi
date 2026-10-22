import { describe, expect, it } from 'vitest';
import { MetricsService } from '@/platform/observability/metrics.service.js';

describe('GraphQL metrics', () => {
  it('exposes bounded operation labels, request counts, errors, histograms, and process gauges', () => {
    const metrics = new MetricsService();
    metrics.observe('query', 0.2);
    metrics.observe('mutation', 0.8, true);
    const output = metrics.renderPrometheus();
    expect(output).toContain('ai_kitchen_graphql_requests_total{operation="query"} 1');
    expect(output).toContain('ai_kitchen_graphql_server_errors_total{operation="mutation"} 1');
    expect(output).toContain('ai_kitchen_graphql_request_duration_seconds_bucket{operation="query",le="0.25"} 1');
    expect(output).toContain('ai_kitchen_graphql_request_duration_seconds_count{operation="mutation"} 1');
    expect(output).toContain('ai_kitchen_process_uptime_seconds');
    expect(output).toContain('ai_kitchen_process_resident_memory_bytes');
    expect(output).not.toContain('operationName');
  });
});
