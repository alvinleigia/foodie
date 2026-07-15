export type MenuItemRecord = {
  id: string;
  organizationId: string;
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
  modifierGroups?: MenuModifierGroupRecord[];
};

export type MenuCategoryRecord = {
  id: string;
  organizationId: string;
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

export type MenuModifierOptionRecord = {
  id: string;
  groupId: string;
  slug: string;
  name: string;
  priceDelta: string;
  sortOrder: number;
  isActive: boolean;
  isSoldOut: boolean;
};

export type MenuModifierGroupRecord = {
  id: string;
  organizationId: string;
  slug: string;
  name: string;
  description: string | null;
  selectionType: "SINGLE" | "MULTIPLE";
  isRequired: boolean;
  minSelections: number;
  maxSelections: number | null;
  sortOrder: number;
  isActive: boolean;
  options: MenuModifierOptionRecord[];
};
