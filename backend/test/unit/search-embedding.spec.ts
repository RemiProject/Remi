import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppConfigService } from '@/platform/config/app-config.service.js';
import { HttpEmbeddingProvider } from '@/modules/search/embedding-provider.js';
import { serializeNormalizedEmbedding } from '@/modules/search/embedding-vector.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('semantic search embeddings', () => {
  it('normalizes exactly 384 finite values for cosine distance', () => {
    const vector = Array.from({ length: 384 }, (_, index) => index === 0 ? 3 : 4);
    const serialized = serializeNormalizedEmbedding(vector).slice(1, -1).split(',').map(Number);
    expect(serialized).toHaveLength(384);
    expect(Math.sqrt(serialized.reduce((sum, value) => sum + value * value, 0))).toBeCloseTo(1);
  });

  it('rejects invalid dimensions and zero magnitude', () => {
    expect(() => serializeNormalizedEmbedding([1, 2])).toThrow(/384/);
    expect(() => serializeNormalizedEmbedding(Array(384).fill(0))).toThrow(/magnitude/);
    expect(() => serializeNormalizedEmbedding([Number.NaN, ...Array(383).fill(0)])).toThrow(/finite/);
  });

  it.each(['query', 'passage'] as const)('adds the multilingual E5 %s prefix', async (kind) => {
    let requestBody: Record<string, unknown> | undefined;
    globalThis.fetch = vi.fn(async (_url, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({ data: [{ embedding: Array(384).fill(0.25) }] }), { status: 200 });
    });
    const config = { env: {
      EMBEDDING_API_URL: 'https://embedding.invalid/v1/embeddings',
      EMBEDDING_API_KEY: undefined,
      EMBEDDING_MODEL: 'intfloat/multilingual-e5-small',
      EMBEDDING_TIMEOUT_MS: 1000,
    } } as unknown as AppConfigService;

    await new HttpEmbeddingProvider(config).embed('tomato', kind);
    expect(requestBody?.input).toBe(`${kind}: tomato`);
  });

  it('does not add E5 prefixes to other embedding models', async () => {
    let requestBody: Record<string, unknown> | undefined;
    globalThis.fetch = vi.fn(async (_url, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({ data: [{ embedding: Array(384).fill(0.25) }] }), { status: 200 });
    });
    const config = { env: {
      EMBEDDING_API_URL: 'http://127.0.0.1:8088/v1/embeddings',
      EMBEDDING_API_KEY: undefined,
      EMBEDDING_MODEL: 'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2',
      EMBEDDING_TIMEOUT_MS: 1000,
    } } as unknown as AppConfigService;

    await new HttpEmbeddingProvider(config).embed('tomato', 'query');
    expect(requestBody?.input).toBe('tomato');
  });
});
