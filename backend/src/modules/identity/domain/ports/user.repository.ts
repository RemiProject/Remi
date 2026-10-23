import type { Tx } from '@/platform/db/tx-context.js';
import type { UserRecord } from '@/modules/identity/domain/entities/identity.records.js';

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

export interface NewUser {
  username: string;
  phoneNumber: string;
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  countryId: string;
  localeId: string;
  preferredLanguageId: string;
  timezone: string;
}

export interface UserRepository {
  create(tx: Tx, user: NewUser): Promise<void>;
  findByEmail(db: Tx, email: string): Promise<UserRecord | null>;
  findByUsername(db: Tx, username: string): Promise<UserRecord | null>;
  findById(db: Tx, id: string): Promise<UserRecord | null>;
  touchLogin(tx: Tx, id: string): Promise<void>;
  markEmailVerified(tx: Tx, id: string): Promise<void>;
  updatePassword(tx: Tx, id: string, passwordHash: string): Promise<void>;
}
