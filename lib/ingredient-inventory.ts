import "server-only";

import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  sql,
} from "drizzle-orm";

import { getDb } from "@/db";
import {
  inventoryIngredients,
  inventoryIngredientMovements,
  menuCategories,
  menuItemIngredients,
  menuItems,
  orderItemIngredientReservations,
  users,
} from "@/db/schema";
import { hasPostgresErrorCode } from "@/lib/postgres-errors";
import type { TenantContext } from "@/lib/tenant-context";
import {
  ingredientSchema,
  ingredientMovementSchema,
  recipeSchema,
} from "@/lib/validations/ingredient-inventory";
import type {
  IngredientInventoryConfiguration,
  IngredientMovementType,
  IngredientRecord,
  RecipeProductRecord,
} from "@/types/ingredient-inventory";

export class IngredientInventoryConflictError extends Error {}

export class IngredientInventoryNotFoundError extends Error {}

export class IngredientInventoryReservationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IngredientInventoryReservationError";
  }
}

type DbClient = ReturnType<typeof getDb>;
type TransactionClient = Parameters<Parameters<DbClient["transaction"]>[0]>[0];

function serializeIngredient(
  ingredient: typeof inventoryIngredients.$inferSelect,
  recipeUsageCount: number,
): IngredientRecord {
  return {
    id: ingredient.id,
    name: ingredient.name,
    unit: ingredient.unit,
    currentQuantity: ingredient.currentQuantity,
    lowStockThreshold: ingredient.lowStockThreshold,
    notes: ingredient.notes,
    isActive: ingredient.isActive,
    recipeUsageCount,
  };
}

async function insertIngredientMovement(
  db: TransactionClient,
  movement: {
    organizationId: string;
    ingredientId: string;
    movementType: IngredientMovementType;
    quantityDelta: string;
    quantityBefore: string;
    quantityAfter: string;
    reason?: string | null;
    referenceType?: string | null;
    referenceId?: string | null;
    recordedByUserId?: string | null;
  },
) {
  await db.insert(inventoryIngredientMovements).values({
    organizationId: movement.organizationId,
    ingredientId: movement.ingredientId,
    movementType: movement.movementType,
    quantityDelta: movement.quantityDelta,
    quantityBefore: movement.quantityBefore,
    quantityAfter: movement.quantityAfter,
    reason: movement.reason ?? null,
    referenceType: movement.referenceType ?? null,
    referenceId: movement.referenceId ?? null,
    recordedByUserId: movement.recordedByUserId ?? null,
  });
}

export async function getIngredientInventoryConfiguration(
  context: TenantContext,
): Promise<IngredientInventoryConfiguration> {
  const db = getDb();
  const [ingredientRows, productRows, recipeRows, movementRows] = await Promise.all([
    db
      .select()
      .from(inventoryIngredients)
      .where(eq(inventoryIngredients.organizationId, context.organizationId))
      .orderBy(asc(inventoryIngredients.name)),
    db
      .select({
        id: menuItems.id,
        name: menuItems.name,
        categoryName: menuCategories.name,
      })
      .from(menuItems)
      .innerJoin(menuCategories, eq(menuCategories.id, menuItems.categoryId))
      .where(
        and(
          eq(menuItems.organizationId, context.organizationId),
          eq(menuCategories.organizationId, context.organizationId),
        ),
      )
      .orderBy(
        asc(menuCategories.sortOrder),
        asc(menuCategories.name),
        asc(menuItems.sortOrder),
        asc(menuItems.name),
      ),
    db
      .select({
        menuItemId: menuItemIngredients.menuItemId,
        ingredientId: menuItemIngredients.ingredientId,
        quantity: menuItemIngredients.quantity,
      })
      .from(menuItemIngredients)
      .where(eq(menuItemIngredients.organizationId, context.organizationId))
      .orderBy(asc(menuItemIngredients.createdAt)),
    db
      .select({
        id: inventoryIngredientMovements.id,
        ingredientId: inventoryIngredientMovements.ingredientId,
        ingredientName: inventoryIngredients.name,
        unit: inventoryIngredients.unit,
        movementType: inventoryIngredientMovements.movementType,
        quantityDelta: inventoryIngredientMovements.quantityDelta,
        quantityBefore: inventoryIngredientMovements.quantityBefore,
        quantityAfter: inventoryIngredientMovements.quantityAfter,
        reason: inventoryIngredientMovements.reason,
        referenceType: inventoryIngredientMovements.referenceType,
        referenceId: inventoryIngredientMovements.referenceId,
        recordedByName: users.name,
        createdAt: inventoryIngredientMovements.createdAt,
      })
      .from(inventoryIngredientMovements)
      .innerJoin(
        inventoryIngredients,
        and(
          eq(
            inventoryIngredients.id,
            inventoryIngredientMovements.ingredientId,
          ),
          eq(
            inventoryIngredients.organizationId,
            inventoryIngredientMovements.organizationId,
          ),
        ),
      )
      .leftJoin(users, eq(users.id, inventoryIngredientMovements.recordedByUserId))
      .where(
        eq(inventoryIngredientMovements.organizationId, context.organizationId),
      )
      .orderBy(desc(inventoryIngredientMovements.createdAt))
      .limit(100),
  ]);

  const usageCountByIngredient = new Map<string, number>();
  const recipeByProduct = new Map<string, RecipeProductRecord["recipe"]>();

  for (const recipeLine of recipeRows) {
    usageCountByIngredient.set(
      recipeLine.ingredientId,
      (usageCountByIngredient.get(recipeLine.ingredientId) ?? 0) + 1,
    );
    const recipe = recipeByProduct.get(recipeLine.menuItemId) ?? [];
    recipe.push({
      ingredientId: recipeLine.ingredientId,
      quantity: recipeLine.quantity,
    });
    recipeByProduct.set(recipeLine.menuItemId, recipe);
  }

  return {
    ingredients: ingredientRows.map((ingredient) =>
      serializeIngredient(
        ingredient,
        usageCountByIngredient.get(ingredient.id) ?? 0,
      ),
    ),
    products: productRows.map((product) => ({
      ...product,
      recipe: recipeByProduct.get(product.id) ?? [],
    })),
    movements: movementRows.map((movement) => ({
      ...movement,
      movementType: movement.movementType as IngredientMovementType,
      createdAt: movement.createdAt.toISOString(),
    })),
  };
}

export async function saveIngredient(
  context: TenantContext,
  input: unknown,
  actorUserId: string | null = null,
) {
  const parsed = ingredientSchema.parse(input);
  const db = getDb();

  try {
    await db.transaction(async (transaction) => {
      if (parsed.id) {
        const [existing] = await transaction
          .select({ currentQuantity: inventoryIngredients.currentQuantity })
          .from(inventoryIngredients)
          .where(
            and(
              eq(inventoryIngredients.id, parsed.id),
              eq(inventoryIngredients.organizationId, context.organizationId),
            ),
          )
          .for("update")
          .limit(1);

        if (!existing) {
          throw new IngredientInventoryNotFoundError("Ingredient not found.");
        }

        if (Number(existing.currentQuantity) !== Number(parsed.currentQuantity)) {
          throw new IngredientInventoryConflictError(
            "Use a stock movement to change the current quantity.",
          );
        }

        await transaction
          .update(inventoryIngredients)
          .set({
            name: parsed.name,
            unit: parsed.unit,
            lowStockThreshold: parsed.lowStockThreshold,
            notes: parsed.notes || null,
            isActive: parsed.isActive,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(inventoryIngredients.id, parsed.id),
              eq(inventoryIngredients.organizationId, context.organizationId),
            ),
          );
        return;
      }

      const [created] = await transaction
        .insert(inventoryIngredients)
        .values({
          organizationId: context.organizationId,
          name: parsed.name,
          unit: parsed.unit,
          currentQuantity: parsed.currentQuantity,
          lowStockThreshold: parsed.lowStockThreshold,
          notes: parsed.notes || null,
          isActive: parsed.isActive,
        })
        .returning({
          id: inventoryIngredients.id,
          currentQuantity: inventoryIngredients.currentQuantity,
        });

      if (Number(parsed.currentQuantity) > 0) {
        await insertIngredientMovement(transaction, {
          organizationId: context.organizationId,
          ingredientId: created.id,
          movementType: "OPENING",
          quantityDelta: parsed.currentQuantity,
          quantityBefore: "0.000",
          quantityAfter: parsed.currentQuantity,
          reason: "Opening quantity",
          recordedByUserId: actorUserId,
        });
      }
    });
  } catch (error) {
    if (hasPostgresErrorCode(error, "23505")) {
      throw new IngredientInventoryConflictError(
        "An ingredient with this name already exists.",
      );
    }

    throw error;
  }

  return getIngredientInventoryConfiguration(context);
}

export async function recordIngredientMovement(
  context: TenantContext,
  input: unknown,
  actorUserId: string,
) {
  const parsed = ingredientMovementSchema.parse(input);
  const db = getDb();

  await db.transaction(async (transaction) => {
    const [ingredient] = await transaction
      .select({
        id: inventoryIngredients.id,
        currentQuantity: inventoryIngredients.currentQuantity,
      })
      .from(inventoryIngredients)
      .where(
        and(
          eq(inventoryIngredients.id, parsed.ingredientId),
          eq(inventoryIngredients.organizationId, context.organizationId),
        ),
      )
      .for("update")
      .limit(1);

    if (!ingredient) {
      throw new IngredientInventoryNotFoundError("Ingredient not found.");
    }

    const quantityBefore = Number(ingredient.currentQuantity);
    const enteredQuantity = Number(parsed.quantity);
    const quantityDelta =
      parsed.action === "STOCKTAKE"
        ? enteredQuantity - quantityBefore
        : parsed.action === "WASTE"
          ? -enteredQuantity
          : enteredQuantity;
    const quantityAfter = quantityBefore + quantityDelta;

    if (quantityAfter < 0) {
      throw new IngredientInventoryConflictError(
        "This movement would make the ingredient quantity negative.",
      );
    }

    const before = quantityBefore.toFixed(3);
    const delta = quantityDelta.toFixed(3);
    const after = quantityAfter.toFixed(3);

    await transaction
      .update(inventoryIngredients)
      .set({ currentQuantity: after, updatedAt: new Date() })
      .where(
        and(
          eq(inventoryIngredients.id, ingredient.id),
          eq(inventoryIngredients.organizationId, context.organizationId),
        ),
      );

    await insertIngredientMovement(transaction, {
      organizationId: context.organizationId,
      ingredientId: ingredient.id,
      movementType: parsed.action,
      quantityDelta: delta,
      quantityBefore: before,
      quantityAfter: after,
      reason: parsed.reason,
      recordedByUserId: actorUserId,
    });
  });

  return getIngredientInventoryConfiguration(context);
}

export async function saveMenuItemRecipe(
  context: TenantContext,
  input: unknown,
) {
  const parsed = recipeSchema.parse(input);
  const db = getDb();

  await db.transaction(async (transaction) => {
    const [product] = await transaction
      .select({ id: menuItems.id })
      .from(menuItems)
      .where(
        and(
          eq(menuItems.id, parsed.menuItemId),
          eq(menuItems.organizationId, context.organizationId),
        ),
      )
      .limit(1);

    if (!product) {
      throw new IngredientInventoryNotFoundError("Menu product not found.");
    }

    if (parsed.ingredients.length) {
      const ingredientIds = parsed.ingredients.map((item) => item.ingredientId);
      const scopedIngredients = await transaction
        .select({ id: inventoryIngredients.id })
        .from(inventoryIngredients)
        .where(
          and(
            eq(inventoryIngredients.organizationId, context.organizationId),
            inArray(inventoryIngredients.id, ingredientIds),
          ),
        );

      if (scopedIngredients.length !== ingredientIds.length) {
        throw new IngredientInventoryNotFoundError(
          "One or more ingredients are not available in this restaurant.",
        );
      }
    }

    await transaction
      .delete(menuItemIngredients)
      .where(
        and(
          eq(menuItemIngredients.organizationId, context.organizationId),
          eq(menuItemIngredients.menuItemId, parsed.menuItemId),
        ),
      );

    if (parsed.ingredients.length) {
      await transaction.insert(menuItemIngredients).values(
        parsed.ingredients.map((ingredient) => ({
          organizationId: context.organizationId,
          menuItemId: parsed.menuItemId,
          ingredientId: ingredient.ingredientId,
          quantity: ingredient.quantity,
        })),
      );
    }
  });

  return getIngredientInventoryConfiguration(context);
}

export async function reserveIngredientsForOrderItem(
  db: TransactionClient,
  context: TenantContext,
  item: {
    drinkId: string;
    drinkName: string;
    id: string;
    orderId: string;
    quantity: number;
  },
) {
  const existingReservations = await db
    .select()
    .from(orderItemIngredientReservations)
    .where(
      and(
        eq(
          orderItemIngredientReservations.organizationId,
          context.organizationId,
        ),
        eq(orderItemIngredientReservations.orderItemId, item.id),
        eq(orderItemIngredientReservations.orderId, item.orderId),
      ),
    )
    .orderBy(asc(orderItemIngredientReservations.createdAt));

  if (existingReservations.length) {
    const restoredReservations = existingReservations.filter(
      (reservation) => reservation.restoredAt !== null,
    );

    if (restoredReservations.length === 0) {
      return true;
    }

    if (restoredReservations.length !== existingReservations.length) {
      throw new IngredientInventoryReservationError(
        `Ingredient stock for ${item.drinkName} is in an inconsistent state.`,
      );
    }

    for (const reservation of existingReservations) {
      const [updated] = await db
        .update(inventoryIngredients)
        .set({
          currentQuantity: sql`${inventoryIngredients.currentQuantity} - ${reservation.quantity}`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(inventoryIngredients.id, reservation.ingredientId),
            eq(inventoryIngredients.organizationId, context.organizationId),
            sql`${inventoryIngredients.currentQuantity} >= ${reservation.quantity}`,
          ),
        )
        .returning({
          id: inventoryIngredients.id,
          currentQuantity: inventoryIngredients.currentQuantity,
        });

      if (!updated) {
        throw new IngredientInventoryReservationError(
          `There is not enough ${reservation.ingredientNameSnapshot} to reopen ${item.drinkName}.`,
        );
      }

      await insertIngredientMovement(db, {
        organizationId: context.organizationId,
        ingredientId: reservation.ingredientId,
        movementType: "SALE",
        quantityDelta: (-Number(reservation.quantity)).toFixed(3),
        quantityBefore: (
          Number(updated.currentQuantity) + Number(reservation.quantity)
        ).toFixed(3),
        quantityAfter: updated.currentQuantity,
        reason: `Reopened ${item.drinkName}`,
        referenceType: "ORDER_ITEM",
        referenceId: item.id,
      });
    }

    await db
      .update(orderItemIngredientReservations)
      .set({ restoredAt: null, updatedAt: new Date() })
      .where(
        and(
          eq(
            orderItemIngredientReservations.organizationId,
            context.organizationId,
          ),
          eq(orderItemIngredientReservations.orderItemId, item.id),
          isNotNull(orderItemIngredientReservations.restoredAt),
        ),
      );

    return true;
  }

  const recipeLines = await db
    .select({
      ingredientId: inventoryIngredients.id,
      ingredientName: inventoryIngredients.name,
      unit: inventoryIngredients.unit,
      currentQuantity: inventoryIngredients.currentQuantity,
      quantityPerItem: menuItemIngredients.quantity,
    })
    .from(menuItemIngredients)
    .innerJoin(
      inventoryIngredients,
      and(
        eq(inventoryIngredients.id, menuItemIngredients.ingredientId),
        eq(
          inventoryIngredients.organizationId,
          menuItemIngredients.organizationId,
        ),
      ),
    )
    .where(
      and(
        eq(menuItemIngredients.organizationId, context.organizationId),
        eq(menuItemIngredients.menuItemId, item.drinkId),
      ),
    )
    .orderBy(asc(menuItemIngredients.createdAt));

  if (recipeLines.length === 0) {
    return false;
  }

  const reservations = recipeLines.map((line) => ({
    ingredientId: line.ingredientId,
    ingredientName: line.ingredientName,
    unit: line.unit,
    currentQuantity: line.currentQuantity,
    quantity: (Number(line.quantityPerItem) * item.quantity).toFixed(3),
  }));

  for (const reservation of reservations) {
    const [updated] = await db
      .update(inventoryIngredients)
      .set({
        currentQuantity: sql`${inventoryIngredients.currentQuantity} - ${reservation.quantity}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(inventoryIngredients.id, reservation.ingredientId),
          eq(inventoryIngredients.organizationId, context.organizationId),
          sql`${inventoryIngredients.currentQuantity} >= ${reservation.quantity}`,
        ),
      )
      .returning({
        id: inventoryIngredients.id,
        currentQuantity: inventoryIngredients.currentQuantity,
      });

    if (!updated) {
      throw new IngredientInventoryReservationError(
        `Only ${formatIngredientQuantity(reservation.currentQuantity)} ${reservation.unit} of ${reservation.ingredientName} is available for ${item.drinkName}.`,
      );
    }

    await insertIngredientMovement(db, {
      organizationId: context.organizationId,
      ingredientId: reservation.ingredientId,
      movementType: "SALE",
      quantityDelta: (-Number(reservation.quantity)).toFixed(3),
      quantityBefore: (
        Number(updated.currentQuantity) + Number(reservation.quantity)
      ).toFixed(3),
      quantityAfter: updated.currentQuantity,
      reason: `Consumed by ${item.drinkName}`,
      referenceType: "ORDER_ITEM",
      referenceId: item.id,
    });
  }

  await db.insert(orderItemIngredientReservations).values(
    reservations.map((reservation) => ({
      organizationId: context.organizationId,
      orderId: item.orderId,
      orderItemId: item.id,
      ingredientId: reservation.ingredientId,
      ingredientNameSnapshot: reservation.ingredientName,
      unitSnapshot: reservation.unit,
      quantity: reservation.quantity,
    })),
  );

  return true;
}

export async function restoreIngredientsForOrderItem(
  db: TransactionClient,
  context: TenantContext,
  item: { id: string; orderId: string },
) {
  const reservations = await db
    .select()
    .from(orderItemIngredientReservations)
    .where(
      and(
        eq(
          orderItemIngredientReservations.organizationId,
          context.organizationId,
        ),
        eq(orderItemIngredientReservations.orderItemId, item.id),
        eq(orderItemIngredientReservations.orderId, item.orderId),
        isNull(orderItemIngredientReservations.restoredAt),
      ),
    );

  if (reservations.length === 0) {
    return false;
  }

  for (const reservation of reservations) {
    const [updated] = await db
      .update(inventoryIngredients)
      .set({
        currentQuantity: sql`${inventoryIngredients.currentQuantity} + ${reservation.quantity}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(inventoryIngredients.id, reservation.ingredientId),
          eq(inventoryIngredients.organizationId, context.organizationId),
        ),
      )
      .returning({ currentQuantity: inventoryIngredients.currentQuantity });

    if (!updated) {
      throw new IngredientInventoryReservationError(
        `Ingredient stock for ${reservation.ingredientNameSnapshot} could not be restored.`,
      );
    }

    await insertIngredientMovement(db, {
      organizationId: context.organizationId,
      ingredientId: reservation.ingredientId,
      movementType: "RESTORE",
      quantityDelta: reservation.quantity,
      quantityBefore: (
        Number(updated.currentQuantity) - Number(reservation.quantity)
      ).toFixed(3),
      quantityAfter: updated.currentQuantity,
      reason: "Order item cancelled",
      referenceType: "ORDER_ITEM",
      referenceId: item.id,
    });
  }

  await db
    .update(orderItemIngredientReservations)
    .set({ restoredAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(
          orderItemIngredientReservations.organizationId,
          context.organizationId,
        ),
        eq(orderItemIngredientReservations.orderItemId, item.id),
        isNull(orderItemIngredientReservations.restoredAt),
      ),
    );

  return true;
}

function formatIngredientQuantity(value: string) {
  return new Intl.NumberFormat("en-GB", { maximumFractionDigits: 3 }).format(
    Number(value),
  );
}
