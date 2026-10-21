import { HttpException } from '@nestjs/common';
import { unwrapResolverError } from '@apollo/server/errors';
import type { GraphQLFormattedError } from 'graphql';
import { DomainError } from '@/shared/domain-error.js';
import { pgCode } from '@/shared/db-errors.js';

const HTTP_CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'UNPROCESSABLE',
  429: 'TOO_MANY_REQUESTS',
};

/**
 * One error mapper for the whole API:
 *   DomainError -> its code · pg 23505 -> 409 · 23514 / 23503 -> 422 · Nest HttpException -> mapped code · anything else -> INTERNAL.
 */
export function formatGraphQLError(formatted: GraphQLFormattedError, error: unknown): GraphQLFormattedError {
  const original = unwrapResolverError(error);

  if (original instanceof DomainError) {
    return { message: original.message, locations: formatted.locations, path: formatted.path, extensions: { code: original.code, status: original.status, ...original.details } };
  }

  if (original instanceof HttpException) {
    const status = original.getStatus();
    const response = original.getResponse() as any;
    const message = Array.isArray(response?.message) ? response.message.join('; ') : (response?.message ?? original.message);
    return { message, locations: formatted.locations, path: formatted.path, extensions: { code: HTTP_CODES[status] ?? 'ERROR', status } };
  }

  switch (pgCode(original)) {
    case '23505':
      return { message: 'Resource already exists', locations: formatted.locations, path: formatted.path, extensions: { code: 'CONFLICT', status: 409 } };
    case '23514':
    case '23503':
      return { message: 'Request violates a data rule', locations: formatted.locations, path: formatted.path, extensions: { code: 'UNPROCESSABLE', status: 422 } };
  }

  if (formatted.extensions?.code && formatted.extensions.code !== 'INTERNAL_SERVER_ERROR') return formatted;
  return { message: 'Internal server error', locations: formatted.locations, path: formatted.path, extensions: { code: 'INTERNAL', status: 500 } };
}
