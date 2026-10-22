import { Injectable } from '@nestjs/common';
import type { ApolloServerPlugin } from '@apollo/server';
import { getOperationAST } from 'graphql';

const buckets = [0.05, 0.1, 0.25, 0.5, 1, 2, 5];
type OperationKind = 'query' | 'mutation' | 'subscription' | 'unknown';
type KindMetrics = { requests: number; serverErrors: number; totalSeconds: number; buckets: number[] };

@Injectable()
export class MetricsService {
  private readonly kinds = new Map<OperationKind, KindMetrics>();

  apolloPlugin(): ApolloServerPlugin {
    return {
      requestDidStart: async (context) => {
        const operation = context.document
          ? getOperationAST(context.document, context.request.operationName)?.operation
          : undefined;
        const kind: OperationKind = operation === 'query' || operation === 'mutation' || operation === 'subscription' ? operation : 'unknown';
        const started = performance.now();
        let hasServerError = false;
        return {
          didEncounterErrors: async ({ errors }) => {
            hasServerError = errors.some((error) => error.extensions?.code === 'INTERNAL_SERVER_ERROR' || Number(error.extensions?.status) >= 500);
          },
          willSendResponse: async () => {
            this.observe(kind, (performance.now() - started) / 1000, hasServerError);
          },
        };
      },
    };
  }

  observe(kind: OperationKind, seconds: number, serverError = false): void {
    const metrics = this.kinds.get(kind) ?? { requests: 0, serverErrors: 0, totalSeconds: 0, buckets: Array(buckets.length).fill(0) as number[] };
    metrics.requests++;
    metrics.totalSeconds += Math.max(0, seconds);
    if (serverError) metrics.serverErrors++;
    buckets.forEach((boundary, index) => { if (seconds <= boundary) metrics.buckets[index]++; });
    this.kinds.set(kind, metrics);
  }

  renderPrometheus(): string {
    const lines = [
      '# HELP ai_kitchen_graphql_requests_total Completed GraphQL operations.',
      '# TYPE ai_kitchen_graphql_requests_total counter',
      '# HELP ai_kitchen_graphql_server_errors_total GraphQL operations ending in an internal server error.',
      '# TYPE ai_kitchen_graphql_server_errors_total counter',
      '# HELP ai_kitchen_graphql_request_duration_seconds GraphQL operation duration.',
      '# TYPE ai_kitchen_graphql_request_duration_seconds histogram',
    ];
    const kinds: OperationKind[] = ['query', 'mutation', 'subscription', 'unknown'];
    for (const kind of kinds) {
      const metrics = this.kinds.get(kind) ?? { requests: 0, serverErrors: 0, totalSeconds: 0, buckets: Array(buckets.length).fill(0) as number[] };
      lines.push(`ai_kitchen_graphql_requests_total{operation="${kind}"} ${metrics.requests}`);
      lines.push(`ai_kitchen_graphql_server_errors_total{operation="${kind}"} ${metrics.serverErrors}`);
      buckets.forEach((boundary, index) => lines.push(`ai_kitchen_graphql_request_duration_seconds_bucket{operation="${kind}",le="${boundary}"} ${metrics.buckets[index]}`));
      lines.push(`ai_kitchen_graphql_request_duration_seconds_bucket{operation="${kind}",le="+Inf"} ${metrics.requests}`);
      lines.push(`ai_kitchen_graphql_request_duration_seconds_sum{operation="${kind}"} ${metrics.totalSeconds}`);
      lines.push(`ai_kitchen_graphql_request_duration_seconds_count{operation="${kind}"} ${metrics.requests}`);
    }
    lines.push(`ai_kitchen_process_uptime_seconds ${process.uptime()}`);
    lines.push(`ai_kitchen_process_resident_memory_bytes ${process.memoryUsage().rss}`);
    return `${lines.join('\n')}\n`;
  }
}
