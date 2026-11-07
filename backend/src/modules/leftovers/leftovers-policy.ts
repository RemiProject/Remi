import { DomainError } from '@/shared/domain-error.js';
export function assertLeftoverDates(cookedOn: string, useBy?: string) {
  const valid = (text: string) => /^\d{4}-\d{2}-\d{2}$/.test(text) && Number.isFinite(Date.parse(text)) && new Date(text).toISOString().slice(0, 10) === text;
  if (!valid(cookedOn) || (useBy && (!valid(useBy) || useBy < cookedOn))) {
    throw new DomainError('BAD_REQUEST', 'Use valid dates; the reminder date cannot precede cooking.');
  }
}
