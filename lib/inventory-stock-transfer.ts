import "server-only";

import { and, asc, desc, eq, gte, inArray, or, sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  inventoryIngredientMovements,
  inventoryIngredients,
  inventoryStockTransferCounters,
  inventoryStockTransferItems,
  inventoryStockTransfers,
  organizations,
  users,
} from "@/db/schema";
import type { TenantContext } from "@/lib/tenant-context";
import {
  stockTransferReceiptSchema,
  stockTransferSchema,
  stockTransferStatusSchema,
} from "@/lib/validations/inventory-stock-transfer";
import type {
  InventoryStockTransferConfiguration,
  StockTransferIngredientRecord,
  StockTransferLineRecord,
  StockTransferStatus,
} from "@/types/inventory-stock-transfer";

export class InventoryStockTransferConflictError extends Error {}

export class InventoryStockTransferNotFoundError extends Error {}

type DbClient = ReturnType<typeof getDb>;
type TransactionClient = Parameters<Parameters<DbClient["transaction"]>[0]>[0];

export function formatStockTransferReference(transferNumber: number) {
  return `ST-${transferNumber.toString().padStart(6, "0")}`;
}

async function getRestaurantCompanyId(
  database: DbClient | TransactionClient,
  organizationId: string,
) {
  const [restaurant] = await database
    .select({
      parentOrganizationId: organizations.parentOrganizationId,
      type: organizations.type,
    })
    .from(organizations)
    .where(
      and(
        eq(organizations.id, organizationId),
        eq(organizations.type, "RESTAURANT"),
        eq(organizations.isActive, true),
      ),
    )
    .limit(1);

  if (!restaurant?.parentOrganizationId) {
    throw new InventoryStockTransferNotFoundError("Restaurant not found.");
  }
  return restaurant.parentOrganizationId;
}

async function assertActiveSiblingRestaurant(
  transaction: TransactionClient,
  sourceOrganizationId: string,
  destinationOrganizationId: string,
) {
  const companyOrganizationId = await getRestaurantCompanyId(
    transaction,
    sourceOrganizationId,
  );
  const [destination] = await transaction
    .select({ id: organizations.id })
    .from(organizations)
    .where(
      and(
        eq(organizations.id, destinationOrganizationId),
        eq(organizations.parentOrganizationId, companyOrganizationId),
        eq(organizations.type, "RESTAURANT"),
        eq(organizations.isActive, true),
      ),
    )
    .limit(1);

  if (!destination || destination.id === sourceOrganizationId) {
    throw new InventoryStockTransferNotFoundError(
      "Active destination restaurant not found in this company.",
    );
  }
}

async function assertTransferIngredients(
  transaction: TransactionClient,
  sourceOrganizationId: string,
  destinationOrganizationId: string,
  lines: Array<{
    sourceIngredientId: string;
    destinationIngredientId: string;
  }>,
) {
  const ingredientIds = [
    ...new Set(
      lines.flatMap((line) => [
        line.sourceIngredientId,
        line.destinationIngredientId,
      ]),
    ),
  ];
  const ingredientRows = await transaction
    .select({
      id: inventoryIngredients.id,
      organizationId: inventoryIngredients.organizationId,
      unit: inventoryIngredients.unit,
      isActive: inventoryIngredients.isActive,
    })
    .from(inventoryIngredients)
    .where(
      and(
        inArray(inventoryIngredients.id, ingredientIds),
        inArray(inventoryIngredients.organizationId, [
          sourceOrganizationId,
          destinationOrganizationId,
        ]),
      ),
    );
  const ingredients = new Map(
    ingredientRows.map((ingredient) => [
      `${ingredient.organizationId}:${ingredient.id}`,
      ingredient,
    ]),
  );

  for (const line of lines) {
    const source = ingredients.get(
      `${sourceOrganizationId}:${line.sourceIngredientId}`,
    );
    const destination = ingredients.get(
      `${destinationOrganizationId}:${line.destinationIngredientId}`,
    );
    if (!source?.isActive || !destination?.isActive) {
      throw new InventoryStockTransferNotFoundError(
        "One or more active transfer ingredients were not found.",
      );
    }
    if (source.unit.trim().toLowerCase() !== destination.unit.trim().toLowerCase()) {
      throw new InventoryStockTransferConflictError(
        "Source and destination ingredient units must match.",
      );
    }
  }
}

export async function getInventoryStockTransferConfiguration(
  context: TenantContext,
): Promise<InventoryStockTransferConfiguration> {
  const db = getDb();
  const companyOrganizationId = await getRestaurantCompanyId(
    db,
    context.organizationId,
  );
  const restaurantRows = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
    })
    .from(organizations)
    .where(
      and(
        eq(organizations.parentOrganizationId, companyOrganizationId),
        eq(organizations.type, "RESTAURANT"),
        eq(organizations.isActive, true),
      ),
    )
    .orderBy(asc(organizations.name));
  const organizationIds = restaurantRows.map((restaurant) => restaurant.id);
  const organizationNames = new Map(
    restaurantRows.map((restaurant) => [restaurant.id, restaurant.name]),
  );
  const ingredientRows = organizationIds.length
    ? await db
        .select({
          id: inventoryIngredients.id,
          organizationId: inventoryIngredients.organizationId,
          name: inventoryIngredients.name,
          unit: inventoryIngredients.unit,
          currentQuantity: inventoryIngredients.currentQuantity,
          isActive: inventoryIngredients.isActive,
        })
        .from(inventoryIngredients)
        .where(inArray(inventoryIngredients.organizationId, organizationIds))
        .orderBy(desc(inventoryIngredients.isActive), asc(inventoryIngredients.name))
    : [];
  const transferRows = await db
    .select()
    .from(inventoryStockTransfers)
    .where(
      or(
        eq(inventoryStockTransfers.sourceOrganizationId, context.organizationId),
        eq(
          inventoryStockTransfers.destinationOrganizationId,
          context.organizationId,
        ),
      ),
    )
    .orderBy(desc(inventoryStockTransfers.createdAt))
    .limit(100);
  const transferIds = transferRows.map((transfer) => transfer.id);
  const itemRows = transferIds.length
    ? await db
        .select()
        .from(inventoryStockTransferItems)
        .where(inArray(inventoryStockTransferItems.transferId, transferIds))
        .orderBy(asc(inventoryStockTransferItems.createdAt))
    : [];
  const userIds = [
    ...new Set(
      transferRows.flatMap((transfer) => [
        transfer.createdByUserId,
        transfer.sentByUserId,
        transfer.receivedByUserId,
      ]).filter((id): id is string => Boolean(id)),
    ),
  ];
  const userRows = userIds.length
    ? await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(inArray(users.id, userIds))
    : [];
  const userNames = new Map(userRows.map((user) => [user.id, user.name]));
  const ingredientByScope = new Map(
    ingredientRows.map((ingredient) => [
      `${ingredient.organizationId}:${ingredient.id}`,
      ingredient,
    ]),
  );
  const itemsByTransfer = new Map<string, StockTransferLineRecord[]>();
  for (const item of itemRows) {
    const source = ingredientByScope.get(
      `${item.sourceOrganizationId}:${item.sourceIngredientId}`,
    );
    const destination = ingredientByScope.get(
      `${item.destinationOrganizationId}:${item.destinationIngredientId}`,
    );
    if (!source || !destination) continue;
    const lines = itemsByTransfer.get(item.transferId) ?? [];
    lines.push({
      id: item.id,
      sourceIngredientId: item.sourceIngredientId,
      sourceIngredientName: source.name,
      destinationIngredientId: item.destinationIngredientId,
      destinationIngredientName: destination.name,
      unit: source.unit,
      quantity: item.quantity,
      receivedQuantity: item.receivedQuantity,
      varianceQuantity:
        item.receivedQuantity === null
          ? null
          : (Number(item.quantity) - Number(item.receivedQuantity)).toFixed(3),
    });
    itemsByTransfer.set(item.transferId, lines);
  }

  const toIngredientRecord = (
    ingredient: (typeof ingredientRows)[number],
  ): StockTransferIngredientRecord => ({
    id: ingredient.id,
    name: ingredient.name,
    unit: ingredient.unit,
    currentQuantity: ingredient.currentQuantity,
    isActive: ingredient.isActive,
  });

  return {
    currentOrganizationId: context.organizationId,
    currentIngredients: ingredientRows
      .filter((ingredient) => ingredient.organizationId === context.organizationId)
      .map(toIngredientRecord),
    destinations: restaurantRows
      .filter((restaurant) => restaurant.id !== context.organizationId)
      .map((restaurant) => ({
        ...restaurant,
        ingredients: ingredientRows
          .filter((ingredient) => ingredient.organizationId === restaurant.id)
          .map(toIngredientRecord),
      })),
    transfers: transferRows.map((transfer) => ({
      id: transfer.id,
      reference: formatStockTransferReference(transfer.transferNumber),
      transferNumber: transfer.transferNumber,
      sourceOrganizationId: transfer.sourceOrganizationId,
      sourceOrganizationName:
        organizationNames.get(transfer.sourceOrganizationId) ?? "Restaurant",
      destinationOrganizationId: transfer.destinationOrganizationId,
      destinationOrganizationName:
        organizationNames.get(transfer.destinationOrganizationId) ?? "Restaurant",
      direction:
        transfer.sourceOrganizationId === context.organizationId
          ? "OUTBOUND"
          : "INBOUND",
      status: transfer.status as StockTransferStatus,
      notes: transfer.notes,
      createdByName: transfer.createdByUserId
        ? userNames.get(transfer.createdByUserId) ?? null
        : null,
      sentByName: transfer.sentByUserId
        ? userNames.get(transfer.sentByUserId) ?? null
        : null,
      receivedByName: transfer.receivedByUserId
        ? userNames.get(transfer.receivedByUserId) ?? null
        : null,
      sentAt: transfer.sentAt?.toISOString() ?? null,
      receivedAt: transfer.receivedAt?.toISOString() ?? null,
      cancelledAt: transfer.cancelledAt?.toISOString() ?? null,
      createdAt: transfer.createdAt.toISOString(),
      lines: itemsByTransfer.get(transfer.id) ?? [],
    })),
  };
}

async function getNextStockTransferNumber(
  transaction: TransactionClient,
  organizationId: string,
) {
  const [counter] = await transaction
    .insert(inventoryStockTransferCounters)
    .values({ organizationId, lastNumber: 1 })
    .onConflictDoUpdate({
      target: inventoryStockTransferCounters.organizationId,
      set: {
        lastNumber: sql`${inventoryStockTransferCounters.lastNumber} + 1`,
        updatedAt: new Date(),
      },
    })
    .returning({ number: inventoryStockTransferCounters.lastNumber });
  if (!counter) throw new Error("Could not allocate a stock-transfer number.");
  return counter.number;
}

export async function createStockTransfer(
  context: TenantContext,
  input: unknown,
  actorUserId: string,
) {
  const parsed = stockTransferSchema.parse(input);
  const db = getDb();
  await db.transaction(async (transaction) => {
    await assertActiveSiblingRestaurant(
      transaction,
      context.organizationId,
      parsed.destinationOrganizationId,
    );
    await assertTransferIngredients(
      transaction,
      context.organizationId,
      parsed.destinationOrganizationId,
      parsed.lines,
    );
    const transferNumber = await getNextStockTransferNumber(
      transaction,
      context.organizationId,
    );
    const [transfer] = await transaction
      .insert(inventoryStockTransfers)
      .values({
        sourceOrganizationId: context.organizationId,
        destinationOrganizationId: parsed.destinationOrganizationId,
        transferNumber,
        notes: parsed.notes,
        createdByUserId: actorUserId,
      })
      .returning({ id: inventoryStockTransfers.id });
    await transaction.insert(inventoryStockTransferItems).values(
      parsed.lines.map((line) => ({
        transferId: transfer.id,
        sourceOrganizationId: context.organizationId,
        destinationOrganizationId: parsed.destinationOrganizationId,
        sourceIngredientId: line.sourceIngredientId,
        destinationIngredientId: line.destinationIngredientId,
        quantity: line.quantity,
      })),
    );
  });
  return getInventoryStockTransferConfiguration(context);
}

export async function updateStockTransfer(
  context: TenantContext,
  transferId: string,
  input: unknown,
) {
  const parsed = stockTransferSchema.parse(input);
  const db = getDb();
  await db.transaction(async (transaction) => {
    const [transfer] = await transaction
      .select({ status: inventoryStockTransfers.status })
      .from(inventoryStockTransfers)
      .where(
        and(
          eq(inventoryStockTransfers.id, transferId),
          eq(
            inventoryStockTransfers.sourceOrganizationId,
            context.organizationId,
          ),
        ),
      )
      .for("update")
      .limit(1);
    if (!transfer) {
      throw new InventoryStockTransferNotFoundError("Stock transfer not found.");
    }
    if (transfer.status !== "DRAFT") {
      throw new InventoryStockTransferConflictError(
        "Only a draft stock transfer can be edited.",
      );
    }
    await assertActiveSiblingRestaurant(
      transaction,
      context.organizationId,
      parsed.destinationOrganizationId,
    );
    await assertTransferIngredients(
      transaction,
      context.organizationId,
      parsed.destinationOrganizationId,
      parsed.lines,
    );
    await transaction
      .delete(inventoryStockTransferItems)
      .where(eq(inventoryStockTransferItems.transferId, transferId));
    await transaction
      .update(inventoryStockTransfers)
      .set({
        destinationOrganizationId: parsed.destinationOrganizationId,
        notes: parsed.notes,
        updatedAt: new Date(),
      })
      .where(eq(inventoryStockTransfers.id, transferId));
    await transaction.insert(inventoryStockTransferItems).values(
      parsed.lines.map((line) => ({
        transferId,
        sourceOrganizationId: context.organizationId,
        destinationOrganizationId: parsed.destinationOrganizationId,
        sourceIngredientId: line.sourceIngredientId,
        destinationIngredientId: line.destinationIngredientId,
        quantity: line.quantity,
      })),
    );
  });
  return getInventoryStockTransferConfiguration(context);
}

export async function updateStockTransferStatus(
  context: TenantContext,
  transferId: string,
  input: unknown,
  actorUserId: string,
) {
  const parsed = stockTransferStatusSchema.parse(input);
  const db = getDb();
  await db.transaction(async (transaction) => {
    const [transfer] = await transaction
      .select()
      .from(inventoryStockTransfers)
      .where(
        and(
          eq(inventoryStockTransfers.id, transferId),
          eq(
            inventoryStockTransfers.sourceOrganizationId,
            context.organizationId,
          ),
        ),
      )
      .for("update")
      .limit(1);
    if (!transfer) {
      throw new InventoryStockTransferNotFoundError("Stock transfer not found.");
    }
    if (transfer.status !== "DRAFT") {
      throw new InventoryStockTransferConflictError(
        "Only a draft stock transfer can be sent or cancelled.",
      );
    }
    if (parsed.action === "CANCEL") {
      await transaction
        .update(inventoryStockTransfers)
        .set({ status: "CANCELLED", cancelledAt: new Date(), updatedAt: new Date() })
        .where(eq(inventoryStockTransfers.id, transferId));
      return;
    }

    await assertActiveSiblingRestaurant(
      transaction,
      transfer.sourceOrganizationId,
      transfer.destinationOrganizationId,
    );
    const lines = await transaction
      .select()
      .from(inventoryStockTransferItems)
      .where(eq(inventoryStockTransferItems.transferId, transferId))
      .for("update");
    if (!lines.length) {
      throw new InventoryStockTransferConflictError(
        "Add at least one ingredient before dispatching this transfer.",
      );
    }
    await assertTransferIngredients(
      transaction,
      transfer.sourceOrganizationId,
      transfer.destinationOrganizationId,
      lines,
    );
    const reference = formatStockTransferReference(transfer.transferNumber);
    for (const line of lines) {
      const [updatedIngredient] = await transaction
        .update(inventoryIngredients)
        .set({
          currentQuantity: sql`${inventoryIngredients.currentQuantity} - ${line.quantity}`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(inventoryIngredients.id, line.sourceIngredientId),
            eq(
              inventoryIngredients.organizationId,
              transfer.sourceOrganizationId,
            ),
            gte(inventoryIngredients.currentQuantity, line.quantity),
          ),
        )
        .returning({ currentQuantity: inventoryIngredients.currentQuantity });
      if (!updatedIngredient) {
        throw new InventoryStockTransferConflictError(
          "A transfer quantity exceeds the available source stock.",
        );
      }
      const quantityBefore = (
        Number(updatedIngredient.currentQuantity) + Number(line.quantity)
      ).toFixed(3);
      const [movement] = await transaction
        .insert(inventoryIngredientMovements)
        .values({
          organizationId: transfer.sourceOrganizationId,
          ingredientId: line.sourceIngredientId,
          movementType: "TRANSFER_OUT",
          quantityDelta: (-Number(line.quantity)).toFixed(3),
          quantityBefore,
          quantityAfter: updatedIngredient.currentQuantity,
          reason: `Sent on ${reference}`,
          referenceType: "STOCK_TRANSFER",
          referenceId: transfer.id,
          recordedByUserId: actorUserId,
        })
        .returning({ id: inventoryIngredientMovements.id });
      await transaction
        .update(inventoryStockTransferItems)
        .set({ sourceMovementId: movement.id, updatedAt: new Date() })
        .where(eq(inventoryStockTransferItems.id, line.id));
    }
    await transaction
      .update(inventoryStockTransfers)
      .set({
        status: "IN_TRANSIT",
        sentByUserId: actorUserId,
        sentAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(inventoryStockTransfers.id, transferId));
  });
  return getInventoryStockTransferConfiguration(context);
}

export async function receiveStockTransfer(
  context: TenantContext,
  transferId: string,
  input: unknown,
  actorUserId: string,
) {
  const parsed = stockTransferReceiptSchema.parse(input);
  const db = getDb();
  await db.transaction(async (transaction) => {
    const [transfer] = await transaction
      .select()
      .from(inventoryStockTransfers)
      .where(
        and(
          eq(inventoryStockTransfers.id, transferId),
          eq(
            inventoryStockTransfers.destinationOrganizationId,
            context.organizationId,
          ),
        ),
      )
      .for("update")
      .limit(1);
    if (!transfer) {
      throw new InventoryStockTransferNotFoundError("Stock transfer not found.");
    }
    if (transfer.status !== "IN_TRANSIT") {
      throw new InventoryStockTransferConflictError(
        "Only an in-transit stock transfer can be received.",
      );
    }
    const lines = await transaction
      .select()
      .from(inventoryStockTransferItems)
      .where(eq(inventoryStockTransferItems.transferId, transferId))
      .for("update");
    if (lines.length !== parsed.lines.length) {
      throw new InventoryStockTransferConflictError(
        "Confirm a received quantity for every transfer line.",
      );
    }
    const receivedByItem = new Map(
      parsed.lines.map((line) => [line.transferItemId, line.receivedQuantity]),
    );
    if (lines.some((line) => !receivedByItem.has(line.id))) {
      throw new InventoryStockTransferConflictError(
        "Confirm a received quantity for every transfer line.",
      );
    }
    for (const line of lines) {
      const receivedQuantity = receivedByItem.get(line.id)!;
      if (Number(receivedQuantity) > Number(line.quantity)) {
        throw new InventoryStockTransferConflictError(
          "Received quantity cannot exceed the dispatched quantity.",
        );
      }
      let destinationMovementId: string | null = null;
      if (Number(receivedQuantity) > 0) {
        const [updatedIngredient] = await transaction
          .update(inventoryIngredients)
          .set({
            currentQuantity: sql`${inventoryIngredients.currentQuantity} + ${receivedQuantity}`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(inventoryIngredients.id, line.destinationIngredientId),
              eq(
                inventoryIngredients.organizationId,
                transfer.destinationOrganizationId,
              ),
              eq(inventoryIngredients.isActive, true),
            ),
          )
          .returning({ currentQuantity: inventoryIngredients.currentQuantity });
        if (!updatedIngredient) {
          throw new InventoryStockTransferNotFoundError(
            "Destination ingredient not found.",
          );
        }
        const quantityBefore = (
          Number(updatedIngredient.currentQuantity) - Number(receivedQuantity)
        ).toFixed(3);
        const [movement] = await transaction
          .insert(inventoryIngredientMovements)
          .values({
            organizationId: transfer.destinationOrganizationId,
            ingredientId: line.destinationIngredientId,
            movementType: "TRANSFER_IN",
            quantityDelta: receivedQuantity,
            quantityBefore,
            quantityAfter: updatedIngredient.currentQuantity,
            reason: `Received against ${formatStockTransferReference(
              transfer.transferNumber,
            )}`,
            referenceType: "STOCK_TRANSFER",
            referenceId: transfer.id,
            recordedByUserId: actorUserId,
          })
          .returning({ id: inventoryIngredientMovements.id });
        destinationMovementId = movement.id;
      }
      await transaction
        .update(inventoryStockTransferItems)
        .set({
          receivedQuantity,
          destinationMovementId,
          updatedAt: new Date(),
        })
        .where(eq(inventoryStockTransferItems.id, line.id));
    }
    await transaction
      .update(inventoryStockTransfers)
      .set({
        status: "RECEIVED",
        receivedByUserId: actorUserId,
        receivedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(inventoryStockTransfers.id, transferId));
  });
  return getInventoryStockTransferConfiguration(context);
}
