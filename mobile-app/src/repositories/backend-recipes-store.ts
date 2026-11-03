import type { BackendRecipe, RecipePage, RecipeRepository, RecipeSuggestion } from '../domain/backend-recipes';
import { isSignedOutError } from '../services/auth-validation';

type Status = 'signed-out' | 'idle' | 'loading' | 'ready' | 'error';
export interface RecipesSnapshot {
  owner: string | null; status: Status; nodes: RecipeSuggestion[]; today: string;
  hasNextPage: boolean; endCursor: string | null; loadingMore: boolean; moreError: boolean;
  detail: { id: string; status: Status; recipe?: BackendRecipe; suggestion?: RecipeSuggestion; matchingError?: boolean; matchingLoading?: boolean } | null;
}
export const emptyRecipes: RecipesSnapshot = { owner: null, status: 'signed-out', nodes: [], today: '', hasNextPage: false, endCursor: null, loadingMore: false, moreError: false, detail: null };
export class BackendRecipesStore {
  private snapshot = emptyRecipes;
  private listeners = new Set<() => void>();
  private generation = 0;
  private listRequest = 0;
  private detailRequest = 0;
  private listActive = false;
  private inventoryKey = '';
  private seen = new Set<string>();
  constructor(private readonly repository: () => RecipeRepository) {}
  getSnapshot = () => this.snapshot;
  getServerSnapshot = () => emptyRecipes;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(update: Partial<RecipesSnapshot>) { this.snapshot = { ...this.snapshot, ...update }; this.listeners.forEach(l => l()); }
  setOwner = (owner: string | null) => {
    if (this.snapshot.owner === owner) return;
    this.generation++; this.seen.clear(); this.inventoryKey = '';
    this.publish({ ...emptyRecipes, owner, status: owner ? 'idle' : 'signed-out' });
  };
  inventoryChanged = (key: string) => {
    if (!this.snapshot.owner || key === this.inventoryKey) return;
    this.inventoryKey = key;
    const detail = this.snapshot.detail?.id;
    this.generation++; this.seen.clear();
    this.publish({ nodes: [], endCursor: null, hasNextPage: false, moreError: false, loadingMore: false, status: 'idle', detail: null });
    if (this.listActive) void this.refresh();
    if (detail) void this.loadDetail(detail);
  };
  private failure(error: unknown) {
    if (isSignedOutError(error)) this.publish({ ...emptyRecipes });
    else if ((error as { code?: string })?.code === 'STALE_CONTEXT') this.publish({ ...emptyRecipes, owner: this.snapshot.owner, status: 'error' });
  }
  refresh = async () => {
    this.listActive = true;
    if (!this.snapshot.owner) return;
    const generation = this.generation, request = ++this.listRequest;
    this.seen.clear(); this.publish({ status: 'loading', nodes: [], endCursor: null, hasNextPage: false, moreError: false, loadingMore: false });
    try {
      const page = await this.repository().list();
      if (generation === this.generation && request === this.listRequest) this.acceptPage(page, false);
    } catch (error) {
      if (generation === this.generation && request === this.listRequest) { this.publish({ status: 'error' }); this.failure(error); }
    }
  };
  private acceptPage(page: RecipePage, append: boolean) {
    if (page.restarted) { append = false; this.seen.clear(); }
    if (page.hasNextPage && (!page.endCursor || this.seen.has(page.endCursor))) throw new Error('Recipe pagination did not advance.');
    if (page.endCursor) this.seen.add(page.endCursor);
    const nodes = append ? [...this.snapshot.nodes, ...page.nodes] : page.nodes;
    if (new Set(nodes.map(n => n.recipe.id)).size !== nodes.length) throw new Error('Duplicate recipes returned while paging.');
    this.publish({ nodes, today: page.today, status: 'ready', hasNextPage: page.hasNextPage, endCursor: page.endCursor, loadingMore: false, moreError: false,
      ...(page.restarted ? { detail: null } : {}) });
  }
  loadMore = async () => {
    if (!this.snapshot.owner || this.snapshot.status !== 'ready' || !this.snapshot.hasNextPage || this.snapshot.loadingMore) return;
    const generation = this.generation, request = ++this.listRequest;
    this.publish({ loadingMore: true, moreError: false });
    try {
      const page = await this.repository().list(this.snapshot.endCursor);
      if (generation === this.generation && request === this.listRequest) this.acceptPage(page, true);
    } catch (error) {
      if (generation === this.generation && request === this.listRequest) { this.publish({ loadingMore: false, moreError: true }); this.failure(error); }
    }
  };
  loadDetail = async (id: string) => {
    if (!this.snapshot.owner) return;
    const generation = this.generation, request = ++this.detailRequest;
    this.publish({ detail: { id, status: 'loading' } });
    try {
      const repository = this.repository();
      const recipe = await repository.get(id);
      if (generation !== this.generation || request !== this.detailRequest) return;
      const cached = this.snapshot.nodes.find(node => node.recipe.id === id);
      if (cached) { this.publish({ detail: { id, status: 'ready', recipe, suggestion: cached } }); return; }
      // Deep links can show instructions while the paginated match lookup is in flight.
      this.publish({ detail: { id, status: 'ready', recipe, matchingLoading: true } });
      let suggestion: RecipeSuggestion | undefined, matchingError = false;
      try { suggestion = await repository.findSuggestion(id); }
      catch (error) {
        if (isSignedOutError(error) || (error as { code?: string })?.code === 'STALE_CONTEXT') throw error;
        matchingError = true;
      }
      if (generation === this.generation && request === this.detailRequest) this.publish({ detail: { id, status: 'ready', recipe, suggestion, matchingError } });
    } catch (error) {
      if (generation === this.generation && request === this.detailRequest) { this.publish({ detail: { id, status: 'error' } }); this.failure(error); }
    }
  };
}
export function visibleRecipes(snapshot: RecipesSnapshot, owner: string | null, busy: boolean): RecipesSnapshot {
  if (busy) return { ...emptyRecipes, status: 'loading' };
  if (!owner) return emptyRecipes;
  if (snapshot.owner !== owner) return { ...emptyRecipes, owner, status: 'loading' };
  return snapshot;
}
