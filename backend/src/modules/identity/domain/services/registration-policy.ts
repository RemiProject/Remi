import { DomainError } from '@/shared/domain-error.js';

export const isStrongPassword = (password: string) => typeof password === 'string' && password.length >= 8 && password.length <= 128
  && /[A-Z]/.test(password) && /[0-9]/.test(password) && /[\p{P}\p{S}]/u.test(password);
export const normalizeUsername = (value: string) => value.trim().toLowerCase();
export const isValidUsername = (value: string) => /^[a-z][a-z0-9_]{2,29}$/.test(value);
export const isSupportedMobile = (value: string) => /^\+201[0125][0-9]{8}$/.test(value) || /^\+9665[0-9]{8}$/.test(value);
export function assertStrongPassword(password: string) {
  if (!isStrongPassword(password)) throw new DomainError('WEAK_PASSWORD', 'Use 8–128 characters with an uppercase letter, number, and special character.', 400);
}
