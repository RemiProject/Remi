import type { Tx } from '@/platform/db/tx-context.js';
import type { NewToken, TokenPurpose } from '@/modules/identity/domain/entities/identity.records.js';

export const TOKEN_REPOSITORY = Symbol('TOKEN_REPOSITORY');

export interface TokenRepository {
  insert(tx: Tx, token: NewToken): Promise<void>;
  /** Atomic single-use: UPDATE … WHERE usedAt IS NULL AND expiresAt > now() RETURNING. Null = invalid / used / expired. */
  consumeByHash(tx: Tx, tokenHash: string, purpose: TokenPurpose): Promise<{ id: string; userId: string | null } | null>;
  consumeById(tx: Tx, id: string): Promise<boolean>;
  /** Used by email handlers to stay idempotent: don't send for a token that is already used / expired. */
  isUsable(db: Tx, id: string): Promise<boolean>;
}
