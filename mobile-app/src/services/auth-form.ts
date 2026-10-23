export const phoneCountries = [
  { code: 'EG', callingCode: '+20', name: { en: 'Egypt', ar: 'مصر' }, nationalPattern: /^1[0125][0-9]{8}$/ },
  { code: 'SA', callingCode: '+966', name: { en: 'Saudi Arabia', ar: 'السعودية' }, nationalPattern: /^5[0-9]{8}$/ },
] as const;
export type PhoneCountry = (typeof phoneCountries)[number]['code'];
export interface AuthDraft { name: string; username: string; email: string; phoneNumber: string; password: string; confirmPassword: string; identifier: string }
export const emptyAuthDraft: AuthDraft = { name: '', username: '', email: '', phoneNumber: '', password: '', confirmPassword: '', identifier: '' };
export const passwordRules = (value: string) => ({ length: value.length >= 8 && value.length <= 128, uppercase: /[A-Z]/.test(value), number: /[0-9]/.test(value), special: /[\p{P}\p{S}]/u.test(value) });
export function normalizePhone(value: string, countryCode: PhoneCountry) {
  const country = phoneCountries.find(entry => entry.code === countryCode)!;
  const cleaned = value.replace(/[\s()\-]/g, '');
  if (cleaned.startsWith('+')) return cleaned.startsWith(country.callingCode) && country.nationalPattern.test(cleaned.slice(country.callingCode.length)) ? cleaned : '';
  const national = cleaned.replace(/^0/, '');
  return country.nationalPattern.test(national) ? `${country.callingCode}${national}` : '';
}
export function validateAuthDraft(draft: AuthDraft, signup: boolean, country: PhoneCountry) {
  const errors: Partial<Record<keyof AuthDraft, string>> = {};
  if (!signup) {
    const id = draft.identifier.trim();
    if (!id || id.length > 254 || (id.includes('@') ? !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(id) : !/^[A-Za-z][A-Za-z0-9_]{2,29}$/.test(id))) errors.identifier = 'identifierInvalid';
    if (!draft.password || draft.password.length > 128) errors.password = 'passwordLogin';
    return errors;
  }
  if (!draft.name.trim() || draft.name.trim().length > 100) errors.name = 'nameInvalid';
  if (!/^[A-Za-z][A-Za-z0-9_]{2,29}$/.test(draft.username.trim())) errors.username = 'usernameInvalid';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim()) || draft.email.trim().length > 254) errors.email = 'emailInvalid';
  if (!normalizePhone(draft.phoneNumber, country)) errors.phoneNumber = 'phoneInvalid';
  if (!Object.values(passwordRules(draft.password)).every(Boolean)) errors.password = 'passwordSignup';
  if (draft.confirmPassword !== draft.password || !draft.confirmPassword) errors.confirmPassword = 'passwordMismatch';
  return errors;
}
