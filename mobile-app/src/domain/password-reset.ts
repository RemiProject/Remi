import { parseEmailCode, toCodeInput } from './email-verification';

/** The address as the server compares it: trimmed and lower case. */
export const normalizeResetEmail = (email: string) => email.trim().toLowerCase();

/** What the code field keeps while typing or pasting: ASCII digits only (Arabic-Indic and Persian converted), at most six. */
export const toResetCodeInput = toCodeInput;

/** The code to send, as a string so leading zeros survive; null unless it is exactly six digits. */
export const parseResetCode = parseEmailCode;

/** Margin before expiry, so a token never runs out while resetPassword is on its way. */
export const RESET_TOKEN_MARGIN_MS = 15_000;

/** Whether a reset token from verifyPasswordResetCode can still be sent. `expiresAt` is in milliseconds. */
export function isResetTokenUsable(expiresAt: number | null, now = Date.now()): boolean {
  return expiresAt !== null && Number.isFinite(expiresAt) && expiresAt - RESET_TOKEN_MARGIN_MS > now;
}
