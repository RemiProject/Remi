export function authErrorKey(error: unknown): string {
  const e = error as { code?: string; codes?: string[]; status?: number } | null;
  const codes = e?.codes ?? [e?.code];
  if (codes.includes('USERNAME_TAKEN')) return 'usernameTaken';
  if (codes.includes('INVALID_USERNAME')) return 'usernameInvalid';
  if (codes.includes('INVALID_PHONE')) return 'phoneInvalid';
  if (codes.includes('WEAK_PASSWORD')) return 'passwordSignup';
  if (codes.includes('INVALID_OR_EXPIRED_TOKEN')) return 'resetExpired';
  if (codes.includes('EMAIL_NOT_VERIFIED')) return 'verifyFirst';
  if (codes.includes('INVALID_CREDENTIALS')) return 'credentials';
  if (codes.includes('EMAIL_ALREADY_REGISTERED')) return 'alreadyRegistered';
  if (codes.includes('INVALID_TIMEZONE')) return 'timezoneInvalid';
  if (codes.includes('REFERENCE_NOT_FOUND')) return 'referencesError';
  if (codes.includes('TOO_MANY_REQUESTS') || e?.status === 429) return 'rateLimit';
  if (codes.includes('STORAGE')) return 'storageError';
  if (codes.includes('BAD_REQUEST')) return 'validationError';
  return 'connectionError';
}
export function isSignedOutError(error: unknown) {
  const e = error as { code?: string; codes?: string[]; status?: number } | null;
  return e?.code === 'NO_SESSION' || e?.codes?.some(c => ['INVALID_REFRESH_TOKEN', 'UNAUTHENTICATED'].includes(c)) || e?.status === 401;
}
