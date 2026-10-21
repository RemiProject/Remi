import { createHash } from 'node:crypto';

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`;
}

/** Stable SHA-256 for prediction inputs. Callers sort all domain collections first. */
export function buildInputHash(input: unknown): string {
  return createHash('sha256').update(canonical(input)).digest('hex');
}
