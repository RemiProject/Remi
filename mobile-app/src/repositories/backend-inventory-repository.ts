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

// Command contract only. Does not replace or implement the local read/write repository.
export interface BackendInventoryRepository {
  list(input?: BackendInventoryListInput): Promise<BackendInventoryConnection>;
  add(input: BackendAddStockInput): Promise<BackendAddStockResult>;
  adjust(input: BackendAdjustStockInput): Promise<BackendAdjustStockResult>;
  consume(input: BackendConsumeStockInput): Promise<BackendConsumeStockResult>;
  discard(input: BackendDiscardStockInput): Promise<BackendDiscardStockResult>;
}
