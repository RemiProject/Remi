export const EMAIL_CODE_LENGTH = 6;
/** Matches the backend's per-account cooldown between codes. */
export const RESEND_COOLDOWN_MS = 60_000;

/** ASCII digits for what was typed or pasted; spaces and invisible direction marks are dropped, anything else is kept so it fails validation. */
export function normalizeEmailCode(text: string): string {
  return text
    .replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 0x0660)) // Arabic-Indic
    .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 0x06f0)) // Persian
    .replace(/[\s؜​-‏‪-‮⁦-⁩]/g, '');
}

/** The code to send, always a string so leading zeros survive; null unless it is exactly six digits. */
export function parseEmailCode(text: string): string | null {
  const code = normalizeEmailCode(text);
  return code.length === EMAIL_CODE_LENGTH && /^[0-9]+$/.test(code) ? code : null;
}

/** When another code may be requested. Keep this instant, not a ticking counter, so the wait stays right after backgrounding. */
export const resendDeadline = (now = Date.now()) => now + RESEND_COOLDOWN_MS;

/** Whole seconds left to wait; 0 when a resend is allowed or no wait has started. */
export function resendSecondsLeft(deadline: number | null, now = Date.now()): number {
  if (deadline === null || !Number.isFinite(deadline)) return 0;
  // A device clock set back must never show more than one full cooldown.
  return Math.ceil(Math.min(RESEND_COOLDOWN_MS, Math.max(0, deadline - now)) / 1000);
}
