/**
 * Application policy for password reset codes. Every reset email (link plus code, or link only) counts toward the
 * cooldown and the daily cap, so links and codes share them.
 */
export const passwordResetCodePolicy = Object.freeze({
  lifetimeMs: 15 * 60_000,
  cooldownMs: 60_000,
  dailyWindowMs: 24 * 60 * 60_000,
  dailyCap: 5,
  maxWrongAttempts: 5,
  /** Failed code attempts per account in the rolling window before every code is refused until the window passes. */
  accountFailureLimit: 10,
  /** Lifetime of the single-use token a correct code is exchanged for. */
  resetTokenLifetimeMs: 10 * 60_000,
});
