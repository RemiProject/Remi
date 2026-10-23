import { initialCookingSession, type CookingSession } from '../utils/cooking-session';

// Memory only: returning to a recipe resumes its session until the app reloads.
const sessions = new Map<string, CookingSession>();
const listeners = new Set<() => void>();
export const cookingSessions = {
  get: (id: string) => sessions.get(id) ?? initialCookingSession,
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  update(id: string, change: (session: CookingSession) => CookingSession) {
    const previous = this.get(id); const next = change(previous);
    if (next === previous) return;
    sessions.set(id, next); listeners.forEach(listener => listener());
  },
};
