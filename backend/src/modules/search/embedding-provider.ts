import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { AppConfigService } from '@/platform/config/app-config.service.js';

export const EMBEDDING_PROVIDER = Symbol('EMBEDDING_PROVIDER');
export type EmbeddingInput = 'query' | 'passage';

export interface EmbeddingProvider {
  embed(text: string, input: EmbeddingInput): Promise<number[]>;
}

@Injectable()
export class HttpEmbeddingProvider implements EmbeddingProvider {
  constructor(private readonly config: AppConfigService) {}

  async embed(text: string, input: EmbeddingInput): Promise<number[]> {
    const { EMBEDDING_API_URL: url, EMBEDDING_API_KEY: key, EMBEDDING_MODEL: model, EMBEDDING_TIMEOUT_MS: timeout } = this.config.env;
    if (!url || !model) throw new ServiceUnavailableException('Semantic search embeddings are not configured');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) },
        // E5 retrieval models require these prefixes; other embedding models do not.
        body: JSON.stringify({ model, input: /(?:^|\/)multilingual-e5/i.test(model) ? `${input}: ${text}` : text }),
        signal: controller.signal,
      });
      if (!response.ok) throw new ServiceUnavailableException(`Embedding provider returned HTTP ${response.status}`);
      const body = await response.json() as { data?: Array<{ embedding?: number[] }> };
      const vector = body.data?.[0]?.embedding;
      if (!vector || vector.length !== 384 || vector.some((value) => !Number.isFinite(value))) {
        throw new ServiceUnavailableException('Embedding provider must return exactly 384 finite values');
      }
      return vector;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException('Embedding provider request failed');
    } finally {
      clearTimeout(timer);
    }
  }
}
