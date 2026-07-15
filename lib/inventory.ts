import { and, asc, eq, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { inventoryItems, menuCategories, menuItems } from "@/db/schema";
import { TenantContext } from "@/lib/tenant-context";
import { inventoryItemUpdateSchema } from "@/lib/validations/inventory";
import { InventoryRecord, InventoryStatus } from "@/types/inventory";

type DbClient = ReturnType<typeof getDb>;
type TransactionClient = Parameters<Parameters<DbClient["transaction"]>[0]>[0];
type InventoryWriteClient = DbClient | TransactionClient;

function getInventoryStatus(input: {
  currentQuantity: string;
  isTracked: boolean;
  lowStockThreshold: string;
}): InventoryStatus {
  if (!input.isTracked) {
    return "not_tracked";
  }

  const currentQuantity = Number(input.currentQuantity);
  const lowStockThreshold = Number(input.lowStockThreshold);

  if (currentQuantity <= 0) {
    return "out";
  }

  if (lowStockThreshold > 0 && currentQuantity <= lowStockThreshold) {
    return "low";
  }

  return "ok";
}

function serializeInventoryRecord(input: {
  categoryId: string;
  categoryName: string;
  inventory: typeof inventoryItems.$inferSelect | null;
  item: typeof menuItems.$inferSelect;
}): InventoryRecord {
  const currentQuantity = input.inventory?.currentQuantity ?? "0.00";
  const lowStockThreshold = input.inventory?.lowStockThreshold ?? "0.00";
  const isTracked = input.inventory?.isTracked ?? false;

  return {
    id: input.inventory?.id ?? null,
    organizationId: input.item.organizationId,
    locationId: input.item.locationId,
    menuItemId: input.item.id,
    categoryId: input.categoryId,
    categoryName: input.categoryName,
    itemName: input.item.name,
    itemPrice: input.item.price ?? null,
    itemIsActive: input.item.isActive,
    itemIsSoldOut: input.item.isSoldOut,
    unit: input.inventory?.unit ?? "servings",
    currentQuantity,
    lowStockThreshold,
    isTracked,
    notes: input.inventory?.notes ?? null,
    status: getInventoryStatus({
      currentQuantity,
      isTracked,
      lowStockThreshold,
    }),
    updatedAt: input.inventory?.updatedAt.toISOString() ?? null,
  };
}

export async function getInventoryRecords(context: TenantContext) {
  const db = getDb();
  const rows = await db
    .select({
      category: menuCategories,
      item: menuItems,
      inventory: inventoryItems,
    })
    .from(menuItems)
    .innerJoin(menuCategories, eq(menuCategories.id, menuItems.categoryId))
    .leftJoin(
      inventoryItems,
      and(
        eq(inventoryItems.menuItemId, menuItems.id),
        eq(inventoryItems.organizationId, context.organizationId),
      ),
    )
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
    );

  return rows.map((row) =>
    serializeInventoryRecord({
      categoryId: row.category.id,
      categoryName: row.category.name,
      inventory: row.inventory,
      item: row.item,
    }),
  );
}

export async function upsertInventoryItem(context: TenantContext, input: unknown) {
  const parsed = inventoryItemUpdateSchema.parse(input);
  const db = getDb();
  const [menuItem] = await db
    .select({ id: menuItems.id })
    .from(menuItems)
    .where(
      and(
        eq(menuItems.id, parsed.menuItemId),
        eq(menuItems.organizationId, context.organizationId),
      ),
    )
    .limit(1);

  if (!menuItem) {
    throw new Error("Menu item not found for this restaurant.");
  }

  await db
    .insert(inventoryItems)
    .values({
      organizationId: context.organizationId,
      locationId: null,
      menuItemId: parsed.menuItemId,
      unit: parsed.unit,
      currentQuantity: parsed.currentQuantity,
      lowStockThreshold: parsed.lowStockThreshold,
      isTracked: parsed.isTracked,
      notes: parsed.notes?.trim() || null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        inventoryItems.organizationId,
        inventoryItems.menuItemId,
      ],
      set: {
        unit: parsed.unit,
        currentQuantity: parsed.currentQuantity,
        lowStockThreshold: parsed.lowStockThreshold,
        isTracked: parsed.isTracked,
        notes: parsed.notes?.trim() || null,
        updatedAt: new Date(),
      },
    });

  return getInventoryRecords(context);
}

export class InventoryReservationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InventoryReservationError";
  }
}

export async function reserveInventoryForOrderItem(
  db: InventoryWriteClient,
  context: TenantContext,
  item: {
    drinkId: string;
    drinkName: string;
    quantity: number;
  },
) {
  const [inventory] = await db
    .select({
      id: inventoryItems.id,
      currentQuantity: inventoryItems.currentQuantity,
      isTracked: inventoryItems.isTracked,
    })
    .from(inventoryItems)
    .where(
      and(
        eq(inventoryItems.organizationId, context.organizationId),
        eq(inventoryItems.menuItemId, item.drinkId),
      ),
    )
    .limit(1);

  if (!inventory?.isTracked) {
    return false;
  }

  const [updatedInventory] = await db
    .update(inventoryItems)
    .set({
      currentQuantity: sql`${inventoryItems.currentQuantity} - ${item.quantity}`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(inventoryItems.id, inventory.id),
        eq(inventoryItems.organizationId, context.organizationId),
        eq(inventoryItems.menuItemId, item.drinkId),
        eq(inventoryItems.isTracked, true),
        sql`${inventoryItems.currentQuantity} >= ${item.quantity}`,
      ),
    )
    .returning({ id: inventoryItems.id });

  if (!updatedInventory) {
    throw new InventoryReservationError(
      `Only ${inventory.currentQuantity} available for ${item.drinkName}.`,
    );
  }

  return true;
}

export async function restoreReservedInventoryForOrderItem(
  db: InventoryWriteClient,
  context: TenantContext,
  item: {
    drinkId: string;
    quantity: number;
  },
) {
  await db
    .update(inventoryItems)
    .set({
      currentQuantity: sql`${inventoryItems.currentQuantity} + ${item.quantity}`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(inventoryItems.organizationId, context.organizationId),
        eq(inventoryItems.menuItemId, item.drinkId),
      ),
    );
}
