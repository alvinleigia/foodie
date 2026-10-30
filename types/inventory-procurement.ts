export type InventorySupplierRecord = {
  id: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  accountReference: string | null;
  notes: string | null;
  isActive: boolean;
};

export type PurchaseOrderStatus =
  | "CANCELLED"
  | "DRAFT"
  | "ORDERED"
  | "PARTIALLY_RECEIVED"
  | "RECEIVED";

export type PurchaseOrderLineRecord = {
  id: string;
  ingredientId: string;
  ingredientName: string;
  unit: string;
  orderedQuantity: string;
  receivedQuantity: string;
  outstandingQuantity: string;
  unitCost: string | null;
  notes: string | null;
};

export type PurchaseOrderReceiptLineRecord = {
  id: string;
  purchaseOrderItemId: string;
  ingredientName: string;
  unit: string;
  quantity: string;
};

export type PurchaseOrderReceiptRecord = {
  id: string;
  receivedByName: string | null;
  notes: string | null;
  createdAt: string;
  lines: PurchaseOrderReceiptLineRecord[];
};

export type PurchaseOrderRecord = {
  id: string;
  reference: string;
  orderNumber: number;
  supplierId: string;
  supplierName: string;
  status: PurchaseOrderStatus;
  currency: string;
  expectedOn: string | null;
  notes: string | null;
  createdByName: string | null;
  orderedAt: string | null;
  receivedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  totalCost: string | null;
  lines: PurchaseOrderLineRecord[];
  receipts: PurchaseOrderReceiptRecord[];
};

export type ProcurementIngredientRecord = {
  id: string;
  name: string;
  unit: string;
  currentQuantity: string;
  isActive: boolean;
};

export type InventoryProcurementConfiguration = {
  suppliers: InventorySupplierRecord[];
  ingredients: ProcurementIngredientRecord[];
  purchaseOrders: PurchaseOrderRecord[];
};
