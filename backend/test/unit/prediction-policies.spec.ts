import { describe, expect, it } from 'vitest';
import { evaluateFreshness } from '@/modules/predictions/domain/freshness-policy.js';
import { buildInputHash } from '@/modules/predictions/domain/input-hash.js';

describe('prediction policies', () => {
  it('selects the newest sufficiently confident freshness sample and expires it to unknown', () => {
    const now = new Date('2026-10-21T12:00:00.000Z');
    const previous = { id: 'a', qualityScore: 0.9, confidence: 0.95, predictedAt: new Date('2026-10-20T12:00:00.000Z'), remainingQualityHours: 72 };
    const newest = { id: 'b', qualityScore: 0.82, confidence: 0.8, predictedAt: new Date('2026-10-21T00:00:00.000Z'), remainingQualityHours: 36 };
    const lowConfidence = { id: 'c', qualityScore: 0.3, confidence: 0.59, predictedAt: new Date('2026-10-21T11:00:00.000Z'), remainingQualityHours: 36 };
    expect(evaluateFreshness([previous, newest, lowConfidence], now)).toBe(0.82);
    expect(evaluateFreshness([{ ...newest, remainingQualityHours: 1 }], now)).toBeNull();
    expect(evaluateFreshness([lowConfidence], now)).toBeNull();
  });

  it('hashes canonical object key order but respects changed inputs', () => {
    expect(buildInputHash({ b: 2, a: [1, 3] })).toBe(buildInputHash({ a: [1, 3], b: 2 }));
    expect(buildInputHash({ a: 1 })).not.toBe(buildInputHash({ a: 2 }));
  });
});
