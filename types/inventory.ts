export type InventoryStatus = "not_tracked" | "out" | "low" | "ok";

export type InventoryRecord = {
  id: string | null;
  organizationId: string;
  menuItemId: string;
  categoryId: string;
  categoryName: string;
  itemName: string;
  itemPrice: string | null;
  itemIsActive: boolean;
  itemIsSoldOut: boolean;
  unit: string;
  currentQuantity: string;
  lowStockThreshold: string;
  isTracked: boolean;
  notes: string | null;
  status: InventoryStatus;
  updatedAt: string | null;
};
