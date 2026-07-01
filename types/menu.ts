export type MenuItemRecord = {
  id: string;
  organizationId: string;
  locationId: string | null;
  categoryId: string;
  slug: string;
  name: string;
  description: string | null;
  price: string | null;
  imageUrl: string | null;
  sortOrder: number;
  isActive: boolean;
  isSoldOut: boolean;
  inventoryStatus?: "not_tracked" | "out" | "low" | "ok";
  inventoryQuantity?: string | null;
  isUnavailableDueToStock?: boolean;
  tags?: MenuTagRecord[];
};

export type MenuCategoryRecord = {
  id: string;
  organizationId: string;
  locationId: string | null;
  slug: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  items: MenuItemRecord[];
};

export type MenuTagRecord = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  color: string;
  sortOrder: number;
  isActive: boolean;
};
