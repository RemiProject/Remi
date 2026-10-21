import { describe, expect, it } from 'vitest';
import { Kind } from 'graphql';
import { DecimalScalar } from '@/platform/graphql/scalars.js';

describe('DecimalScalar', () => {
  const scalar = new DecimalScalar();

  it('accepts decimal strings and rejects JSON numbers', () => {
    expect(scalar.parseValue('0.333')).toBe('0.333');
    expect(() => scalar.parseValue(0.333)).toThrow(/numeric string/);
  });

  it('requires a quoted decimal literal in GraphQL documents', () => {
    expect(scalar.parseLiteral({ kind: Kind.STRING, value: '0.333' })).toBe('0.333');
    expect(() => scalar.parseLiteral({ kind: Kind.FLOAT, value: '0.333' })).toThrow(/passed as a string/);
  });
});
