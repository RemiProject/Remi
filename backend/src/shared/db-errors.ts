/** Postgres SQLSTATE extraction that works for raw `pg` errors and Prisma (driver adapter) errors. */
export function pgCode(err: unknown): string | undefined {
  const e = err as any;
  const candidates = [
    e?.code,
    e?.cause?.code,
    e?.meta?.driverAdapterError?.cause?.originalCode,
    e?.meta?.code,
    e?.cause?.originalCode,
  ];
  const found = candidates.find((c) => typeof c === 'string' && /^[0-9A-Z]{5}$/.test(c) && !/^P\d{4}$/.test(c));
  if (found) return found;
  if (e?.code === 'P2002') return '23505';
  if (e?.code === 'P2003') return '23503';
  return undefined;
}

export const isUniqueViolation = (err: unknown): boolean => pgCode(err) === '23505';
export const isCheckViolation = (err: unknown): boolean => pgCode(err) === '23514';
export const isForeignKeyViolation = (err: unknown): boolean => pgCode(err) === '23503';
export const isRetryable = (err: unknown): boolean => ['40001', '40P01'].includes(pgCode(err) ?? '');
