/** Application policy: existing 24-hour link token settings are deliberately independent. */
export const emailVerificationCodePolicy = Object.freeze({
  lifetimeMs: 15 * 60_000,
  cooldownMs: 60_000,
  dailyWindowMs: 24 * 60 * 60_000,
  dailyCap: 10,
  maxWrongAttempts: 5,
});
