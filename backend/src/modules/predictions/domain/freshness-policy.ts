export interface FreshnessSample {
  id: string;
  qualityScore: number;
  confidence: number;
  predictedAt: Date;
  remainingQualityHours: number;
}

/** Freshness is display-only; stale or uncertain samples produce unknown (null). */
export function evaluateFreshness(samples: FreshnessSample[], now: Date, minConfidence = 0.6): number | null {
  const latest = samples
    .filter((sample) => sample.confidence >= Math.max(0, Math.min(1, minConfidence)))
    .sort((a, b) => b.predictedAt.getTime() - a.predictedAt.getTime() || b.id.localeCompare(a.id))[0];
  if (!latest) return null;
  const validUntil = latest.predictedAt.getTime() + latest.remainingQualityHours * 60 * 60 * 1000;
  return validUntil > now.getTime() ? latest.qualityScore : null;
}
