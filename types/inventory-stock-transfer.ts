export type StockTransferStatus =
  | "CANCELLED"
  | "DRAFT"
  | "IN_TRANSIT"
  | "RECEIVED";

export type StockTransferIngredientRecord = {
  id: string;
  name: string;
  unit: string;
  currentQuantity: string;
  isActive: boolean;
};

export type StockTransferDestinationRecord = {
  id: string;
  name: string;
  slug: string;
  ingredients: StockTransferIngredientRecord[];
};

export type StockTransferLineRecord = {
  id: string;
  sourceIngredientId: string;
  sourceIngredientName: string;
  destinationIngredientId: string;
  destinationIngredientName: string;
  unit: string;
  quantity: string;
  receivedQuantity: string | null;
  varianceQuantity: string | null;
};

export type StockTransferRecord = {
  id: string;
  reference: string;
  transferNumber: number;
  sourceOrganizationId: string;
  sourceOrganizationName: string;
  destinationOrganizationId: string;
  destinationOrganizationName: string;
  direction: "INBOUND" | "OUTBOUND";
  status: StockTransferStatus;
  notes: string | null;
  createdByName: string | null;
  sentByName: string | null;
  receivedByName: string | null;
  sentAt: string | null;
  receivedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  lines: StockTransferLineRecord[];
};

export type InventoryStockTransferConfiguration = {
  currentOrganizationId: string;
  currentIngredients: StockTransferIngredientRecord[];
  destinations: StockTransferDestinationRecord[];
  transfers: StockTransferRecord[];
};
