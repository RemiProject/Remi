import { describe, expect, it } from 'vitest';
import { DomainError } from '@/shared/domain-error.js';
import { pgCode } from '@/shared/db-errors.js';
import { formatGraphQLError } from '@/platform/graphql/error-mapper.js';

describe('db error helpers', () => {
  it('extracts SQLSTATE from pg and Prisma-style errors', () => {
    expect(pgCode({ code: '23505' })).toBe('23505');
    expect(pgCode({ code: 'P2002' })).toBe('23505');
    expect(pgCode({ meta: { driverAdapterError: { cause: { originalCode: '23514' } } } })).toBe('23514');
    expect(pgCode(new Error('x'))).toBeUndefined();
  });
  it('DomainError carries code and status', () => {
    const e = new DomainError('X', 'msg', 409);
    expect(e).toMatchObject({ code: 'X', status: 409, message: 'msg' });
  });
  it('maps a duplicate catalog alias constraint to a conflict response', () => {
    const result = formatGraphQLError({ message: 'duplicate key', extensions: { code: 'INTERNAL_SERVER_ERROR' } }, { code: '23505' });
    expect(result.extensions).toMatchObject({ code: 'CONFLICT', status: 409 });
  });
});
