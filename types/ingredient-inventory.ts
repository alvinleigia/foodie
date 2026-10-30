export type IngredientRecord = {
  id: string;
  name: string;
  unit: string;
  currentQuantity: string;
  lowStockThreshold: string;
  notes: string | null;
  isActive: boolean;
  recipeUsageCount: number;
};

export type RecipeLineRecord = {
  ingredientId: string;
  quantity: string;
};

export type RecipeProductRecord = {
  id: string;
  name: string;
  categoryName: string;
  recipe: RecipeLineRecord[];
};

export type IngredientMovementType =
  | "ADJUSTMENT"
  | "OPENING"
  | "RECEIPT"
  | "RESTORE"
  | "SALE"
  | "STOCKTAKE"
  | "TRANSFER_IN"
  | "TRANSFER_OUT"
  | "WASTE";

export type IngredientMovementRecord = {
  id: string;
  ingredientId: string;
  ingredientName: string;
  unit: string;
  movementType: IngredientMovementType;
  quantityDelta: string;
  quantityBefore: string;
  quantityAfter: string;
  reason: string | null;
  referenceType: string | null;
  referenceId: string | null;
  recordedByName: string | null;
  createdAt: string;
};

export type IngredientInventoryConfiguration = {
  ingredients: IngredientRecord[];
  products: RecipeProductRecord[];
  movements: IngredientMovementRecord[];
};
