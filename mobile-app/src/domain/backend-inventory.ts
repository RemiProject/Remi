// Wire types from backend/schema.graphql. Dates remain raw scalar strings;
// this module makes no date-only/expiry conversion policy.
export type Decimal = string;

export enum BackendUnit {
  GRAM = 'GRAM',
  KILOGRAM = 'KILOGRAM',
  MILLILITER = 'MILLILITER',
  LITER = 'LITER',
  PIECE = 'PIECE',
  CUP = 'CUP',
  TABLESPOON = 'TABLESPOON',
  TEASPOON = 'TEASPOON',
}

export enum BackendStorageLocation {
  FRIDGE = 'FRIDGE',
  FREEZER = 'FREEZER',
  PANTRY = 'PANTRY',
  COUNTER = 'COUNTER',
  OTHER = 'OTHER',
}

export interface BackendInventoryItem {
  id: string;
  foodId: string;
  foodName: string;
  quantity: Decimal;
  unit: BackendUnit;
  storageLocation: BackendStorageLocation;
  estimatedExpiryAt: string | null;
  version: number;
}

export interface BackendInventoryListInput {
  first?: number;
  after?: string | null;
}

export interface BackendInventoryConnection {
  nodes: BackendInventoryItem[];
  hasNextPage: boolean;
  endCursor: string | null;
}

export interface BackendInventoryTransaction {
  id: string;
  eventId: string;
  movementType: string;
  quantityDelta: Decimal;
  balanceAfter: Decimal;
  createdAt: string;
}

export interface BackendInventoryItemDetail extends BackendInventoryItem {
  transactions: {
    nodes: BackendInventoryTransaction[];
    hasNextPage: boolean;
    endCursor: string | null;
  };
}

// addStock, consumeStock and discardStock share InventoryStockInput in GraphQL.
export interface BackendInventoryStockInput {
  foodId: string;
  amount: Decimal;
  unit: BackendUnit;
  idempotencyKey: string;
  storageLocation?: BackendStorageLocation | null;
  purchaseDate?: string | null;
  estimatedExpiryAt?: string | null;
}

export type BackendAddStockInput = BackendInventoryStockInput;
export type BackendConsumeStockInput = BackendInventoryStockInput;
export type BackendDiscardStockInput = BackendInventoryStockInput;

export interface BackendAdjustStockInput {
  inventoryItemId: string;
  delta: Decimal;
  idempotencyKey: string;
}

export interface BackendInventoryMovement {
  inventoryItemId: string;
  quantityDelta: Decimal;
  balanceAfter: Decimal;
}

// Future queries must select __typename to discriminate the GraphQL union.
export interface BackendInventoryMutationSuccess {
  __typename: 'InventoryMutationSuccessType';
  eventId: string;
  replayed: boolean;
  foodId: string;
  quantity: Decimal;
  unit: BackendUnit;
  balances: BackendInventoryMovement[];
}

export interface BackendInsufficientStock {
  __typename: 'InsufficientStockType';
  available: Decimal;
  unit: BackendUnit;
}

export type BackendInventoryMutationResult = BackendInventoryMutationSuccess | BackendInsufficientStock;
export type BackendAddStockResult = BackendInventoryMutationResult;
export type BackendConsumeStockResult = BackendInventoryMutationResult;
export type BackendAdjustStockResult = BackendInventoryMutationResult;
export type BackendDiscardStockResult = BackendInventoryMutationResult;
