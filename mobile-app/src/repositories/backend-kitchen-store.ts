import type { InventoryReadDetail, InventoryReadItem } from '../domain/backend-inventory-read-model';
import { isSignedOutError } from '../services/auth-validation';

type Status = 'signed-out' | 'loading' | 'ready' | 'error';
export interface BackendKitchenSnapshot {
  owner: string | null;
  status: Status;
  items: InventoryReadItem[];
  today: string;
  detail: { id: string; status: Status; item?: InventoryReadDetail } | null;
  additionNotice: number | null;
}
interface Reads {
  list(): Promise<{ items: InventoryReadItem[]; today: string }>;
  get(id: string): Promise<InventoryReadDetail>;
}
export const emptyBackendKitchen: BackendKitchenSnapshot = { owner: null, status: 'signed-out', items: [], today: '', detail: null, additionNotice: null };

/** No mutation methods or local inventory access. Generations also protect UI state. */
export class BackendKitchenStore {
  private snapshot = emptyBackendKitchen;
  private listeners = new Set<() => void>();
  private generation = 0;
  private listRequest = 0;
  private detailRequest = 0;
  private noticeSequence = 0;
  constructor(private readonly reads: () => Reads) {}
  getSnapshot = () => this.snapshot;
  getServerSnapshot = () => emptyBackendKitchen;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(update: Partial<BackendKitchenSnapshot>) {
    this.snapshot = { ...this.snapshot, ...update };
    this.listeners.forEach(listener => listener());
  }
  setUser = (owner: string | null) => {
    if (owner === this.snapshot.owner) return;
    this.generation++;
    this.publish({ ...emptyBackendKitchen, owner, status: owner ? 'loading' : 'signed-out' });
    if (owner) void this.reload();
  };
  updateToday = (today: string) => {
    if (this.snapshot.owner && today !== this.snapshot.today) this.publish({ today });
  };
  showAdded = () => {
    if (this.snapshot.owner) this.publish({ additionNotice: ++this.noticeSequence });
  };
  dismissAdded = (notice: number) => {
    if (this.snapshot.additionNotice === notice) this.publish({ additionNotice: null });
  };
  reload = async () => {
    if (!this.snapshot.owner) return;
    const generation = this.generation, request = ++this.listRequest;
    this.publish({ status: 'loading', items: [] });
    try {
      const { items, today } = await this.reads().list();
      if (generation === this.generation && request === this.listRequest) this.publish({ status: 'ready', items, today });
    } catch (error) {
      if (generation === this.generation && request === this.listRequest) {
        this.publish({ status: isSignedOutError(error) ? 'signed-out' : 'error', items: [], detail: null });
      }
    }
  };
  loadDetail = async (id: string) => {
    if (!this.snapshot.owner) return;
    const generation = this.generation, request = ++this.detailRequest;
    this.publish({ detail: { id, status: 'loading' } });
    try {
      const item = await this.reads().get(id);
      if (generation === this.generation && request === this.detailRequest) this.publish({ detail: { id, status: 'ready', item } });
    } catch (error) {
      if (generation === this.generation && request === this.detailRequest) {
        if (isSignedOutError(error)) this.publish({ status: 'signed-out', items: [], detail: null });
        else this.publish({ detail: { id, status: 'error' } });
      }
    }
  };
}

/** Mask old data during the render that observes an auth transition, before effects run. */
export function visibleBackendKitchen(snapshot: BackendKitchenSnapshot, owner: string | null, busy: boolean): BackendKitchenSnapshot {
  if (busy) return { ...emptyBackendKitchen, status: 'loading' };
  if (!owner) return emptyBackendKitchen;
  if (snapshot.owner !== owner) return { ...emptyBackendKitchen, owner, status: 'loading' };
  return snapshot;
}
