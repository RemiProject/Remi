import { validMeal, type PlannedMeal, type MealPeriod } from '../domain/planner';
import type { KeyValueStorage } from './inventory-repository';
export const PLANNER_KEY = 'remy.meal-planner';
const initial = { meals: [] as readonly PlannedMeal[], status: 'loading' as 'loading' | 'ready' | 'error', pending: false, writeError: false };
let sequence = 0;
export class PlannerStore {
  private snapshot = initial;
  private listeners = new Set<() => void>();
  private reading: Promise<void> | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private storage: KeyValueStorage) {}
  getSnapshot = () => this.snapshot;
  getServerSnapshot = () => initial;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(changes: Partial<typeof initial>) { this.snapshot = { ...this.snapshot, ...changes }; this.listeners.forEach((listener) => listener()); }
  hydrate = () => {
    if (this.reading) return this.reading;
    if (this.snapshot.status === 'ready') return Promise.resolve();
    this.publish({ status: 'loading' });
    this.reading = this.storage.getItem(PLANNER_KEY).then((raw) => {
      const data = raw === null ? { version: 1, meals: [] } : JSON.parse(raw);
      if (!data || typeof data !== 'object' || Array.isArray(data) || data.version !== 1 || Object.keys(data).length !== 2 || !Array.isArray(data.meals)
        || !data.meals.every(validMeal) || new Set(data.meals.map((meal: PlannedMeal) => meal.id)).size !== data.meals.length) throw new Error('Invalid planner');
      this.publish({ meals: data.meals, status: 'ready', writeError: false });
    }).catch(() => { this.publish({ status: 'error' }); }).finally(() => { this.reading = null; });
    return this.reading;
  };
  private mutate(operation: (meals: readonly PlannedMeal[]) => PlannedMeal[]) {
    if (this.snapshot.status !== 'ready') return Promise.reject(new Error('Planner not ready'));
    const task = this.queue.then(async () => {
      this.publish({ pending: true, writeError: false });
      try {
        const next = operation(this.snapshot.meals);
        await this.storage.setItem(PLANNER_KEY, JSON.stringify({ version: 1, meals: next }));
        this.publish({ meals: next });
      } catch (error) { this.publish({ writeError: true }); throw error; }
      finally { this.publish({ pending: false }); }
    });
    this.queue = task.catch(() => undefined);
    return task;
  }
  add = (date: string, period: MealPeriod, recipeId: string) => this.mutate((meals) => {
    let id: string;
    do { id = `meal_${Date.now().toString(36)}_${(++sequence).toString(36)}`; } while (meals.some((meal) => meal.id === id));
    const meal = { id, date, period, recipeId };
    if (!validMeal(meal)) throw new Error('Invalid meal');
    return [...meals, meal];
  });
  remove = (id: string) => this.mutate((meals) => {
    if (!meals.some((meal) => meal.id === id)) throw new Error('Meal not found');
    return meals.filter((meal) => meal.id !== id);
  });
}
