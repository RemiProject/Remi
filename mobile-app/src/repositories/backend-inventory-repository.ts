import type {
  BackendAddStockInput,
  BackendAddStockResult,
  BackendAdjustStockInput,
  BackendAdjustStockResult,
  BackendConsumeStockInput,
  BackendConsumeStockResult,
  BackendDiscardStockInput,
  BackendDiscardStockResult,
  BackendInventoryConnection,
  BackendInventoryListInput,
} from '../domain/backend-inventory';
import type { InventoryReadDetail, InventoryReadItem } from '../domain/backend-inventory-read-model';

// Mapped reads are separate from the paginated wire/command contract below.
export interface BackendInventoryReadRepository {
  list(): Promise<InventoryReadItem[]>;
  get(id: string): Promise<InventoryReadDetail>;
}

// Command contract only. Does not replace or implement the local read/write repository.
export interface BackendInventoryRepository {
  list(input?: BackendInventoryListInput): Promise<BackendInventoryConnection>;
  add(input: BackendAddStockInput): Promise<BackendAddStockResult>;
  adjust(input: BackendAdjustStockInput): Promise<BackendAdjustStockResult>;
  consume(input: BackendConsumeStockInput): Promise<BackendConsumeStockResult>;
  discard(input: BackendDiscardStockInput): Promise<BackendDiscardStockResult>;
}
