import { createHash, randomBytes } from 'node:crypto';

/** One-time tokens: only the sha256 is stored; the raw value travels once, inside an email link. */
export const generateRawToken = (): string => randomBytes(32).toString('base64url');
export const hashToken = (raw: string): string => createHash('sha256').update(raw).digest('hex');
