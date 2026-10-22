import { Scalar } from '@nestjs/graphql';
import { GraphQLError, Kind, type ValueNode } from 'graphql';

/** "2026-10-16" calendar date (no time zone). */
@Scalar('LocalDate')
export class LocalDateScalar {
  description = 'ISO calendar date (YYYY-MM-DD)';
  private static readonly RE = /^\d{4}-\d{2}-\d{2}$/;

  parseValue(value: unknown): string {
    if (typeof value !== 'string' || !LocalDateScalar.RE.test(value)) throw new GraphQLError('LocalDate must be YYYY-MM-DD');
    return value;
  }
  serialize(value: unknown): string {
    return value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
  }
  parseLiteral(ast: ValueNode): string {
    if (ast.kind !== Kind.STRING) throw new GraphQLError('LocalDate must be a string');
    return this.parseValue(ast.value);
  }
}

/** Quantities and money travel as strings, never floats. */
@Scalar('Decimal')
export class DecimalScalar {
  description = 'Arbitrary-precision decimal serialized as a string';
  private static readonly RE = /^-?\d+(\.\d+)?$/;

  parseValue(value: unknown): string {
    if (typeof value !== 'string' || !DecimalScalar.RE.test(value)) throw new GraphQLError('Decimal must be a numeric string');
    return value;
  }
  serialize(value: unknown): string {
    return String(value);
  }
  parseLiteral(ast: ValueNode): string {
    if (ast.kind !== Kind.STRING) throw new GraphQLError('Decimal must be passed as a string');
    return this.parseValue(ast.value);
  }
}
