export function serializeNormalizedEmbedding(vector: number[]): string {
  if (vector.length !== 384 || vector.some((value) => !Number.isFinite(value))) {
    throw new Error('Embedding vector must contain exactly 384 finite values');
  }
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!Number.isFinite(magnitude) || magnitude === 0) throw new Error('Embedding vector must have a positive finite magnitude');
  return `[${vector.map((value) => value / magnitude).join(',')}]`;
}
