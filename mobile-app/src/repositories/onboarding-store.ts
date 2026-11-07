import { validRecord, type OnboardingAnswers, type OnboardingRecord } from '../domain/onboarding';
import type { KeyValueStorage } from './inventory-repository';
export const ONBOARDING_KEY = 'remy.onboarding';
const initial = { record: null as OnboardingRecord | null, status: 'loading' as 'loading' | 'ready' | 'error' };
export class OnboardingStore {
  private snapshot = initial;
  private listeners = new Set<() => void>();
  private reading: Promise<void> | null = null;
  constructor(private storage: KeyValueStorage) {}
  getSnapshot = () => this.snapshot;
  getServerSnapshot = () => initial;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(changes: Partial<typeof initial>) { this.snapshot = { ...this.snapshot, ...changes }; this.listeners.forEach((listener) => listener()); }
  hydrate = () => {
    if (this.reading) return this.reading;
    if (this.snapshot.status === 'ready') return Promise.resolve();
    this.reading = this.storage.getItem(ONBOARDING_KEY).then((raw) => {
      const record = raw === null ? null : JSON.parse(raw);
      if (record !== null && !validRecord(record)) throw new Error('Invalid onboarding record');
      this.publish({ record, status: 'ready' });
    }).catch(() => { this.publish({ status: 'error' }); }).finally(() => { this.reading = null; });
    return this.reading;
  };
  complete = async (answers: OnboardingAnswers, skipped: boolean) => {
    const record: OnboardingRecord = { version: 1, completedAt: new Date().toISOString(), skipped, answers };
    if (!validRecord(record)) throw new Error('Invalid onboarding answers');
    await this.storage.setItem(ONBOARDING_KEY, JSON.stringify(record));
    this.publish({ record, status: 'ready' });
  };
}
