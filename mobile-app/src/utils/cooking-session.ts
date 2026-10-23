export interface CookingSession { current: number; completed: readonly number[]; finished: boolean }
export const initialCookingSession: CookingSession = { current: 0, completed: [], finished: false };
export function cookingInstructions(catalog: Record<string, unknown>, id: string): readonly string[] {
  const steps = catalog[id];
  return Array.isArray(steps) && steps.length > 0 && steps.every(step => typeof step === 'string' && step.trim()) ? steps : [];
}
export function advanceCooking(session: CookingSession, total: number): CookingSession {
  if (session.finished || total < 1) return session;
  const completed = [...new Set([...session.completed, session.current])];
  return { current: Math.min(session.current + 1, total - 1), completed, finished: session.current === total - 1 };
}
export function selectCookingStep(session: CookingSession, index: number, total: number): CookingSession {
  if (session.finished || !Number.isInteger(index) || index < 0 || index >= total) return session;
  return { ...session, current: index };
}
