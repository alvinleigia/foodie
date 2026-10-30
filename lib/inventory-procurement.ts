import "server-only";

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  inventoryIngredientMovements,
  inventoryIngredients,
  inventoryPurchaseOrderCounters,
  inventoryPurchaseOrderItems,
  inventoryPurchaseOrderReceiptItems,
  inventoryPurchaseOrderReceipts,
  inventoryPurchaseOrders,
  inventorySuppliers,
  organizations,
  users,
} from "@/db/schema";
import { hasPostgresErrorCode } from "@/lib/postgres-errors";
import type { TenantContext } from "@/lib/tenant-context";
import {
  inventorySupplierSchema,
  purchaseOrderReceiptSchema,
  purchaseOrderSchema,
  purchaseOrderStatusSchema,
} from "@/lib/validations/inventory-procurement";
import type {
  InventoryProcurementConfiguration,
  PurchaseOrderLineRecord,
  PurchaseOrderReceiptRecord,
  PurchaseOrderStatus,
} from "@/types/inventory-procurement";

export class InventoryProcurementConflictError extends Error {}

export class InventoryProcurementNotFoundError extends Error {}

type DbClient = ReturnType<typeof getDb>;
type TransactionClient = Parameters<Parameters<DbClient["transaction"]>[0]>[0];

export function formatPurchaseOrderReference(orderNumber: number) {
  return `PO-${orderNumber.toString().padStart(6, "0")}`;
}

export async function getInventoryProcurementConfiguration(
  context: TenantContext,
): Promise<InventoryProcurementConfiguration> {
  const db = getDb();
  const [supplierRows, ingredientRows, orderRows, itemRows, receiptRows, receiptItemRows] =
    await Promise.all([
      db
        .select()
        .from(inventorySuppliers)
        .where(eq(inventorySuppliers.organizationId, context.organizationId))
        .orderBy(desc(inventorySuppliers.isActive), asc(inventorySuppliers.name)),
      db
        .select({
          id: inventoryIngredients.id,
          name: inventoryIngredients.name,
          unit: inventoryIngredients.unit,
          currentQuantity: inventoryIngredients.currentQuantity,
          isActive: inventoryIngredients.isActive,
        })
        .from(inventoryIngredients)
        .where(eq(inventoryIngredients.organizationId, context.organizationId))
        .orderBy(desc(inventoryIngredients.isActive), asc(inventoryIngredients.name)),
      db
        .select({
          id: inventoryPurchaseOrders.id,
          supplierId: inventoryPurchaseOrders.supplierId,
          supplierName: inventorySuppliers.name,
          orderNumber: inventoryPurchaseOrders.orderNumber,
          status: inventoryPurchaseOrders.status,
          currency: inventoryPurchaseOrders.currency,
          expectedOn: inventoryPurchaseOrders.expectedOn,
          notes: inventoryPurchaseOrders.notes,
          createdByName: users.name,
          orderedAt: inventoryPurchaseOrders.orderedAt,
          receivedAt: inventoryPurchaseOrders.receivedAt,
          cancelledAt: inventoryPurchaseOrders.cancelledAt,
          createdAt: inventoryPurchaseOrders.createdAt,
        })
        .from(inventoryPurchaseOrders)
        .innerJoin(
          inventorySuppliers,
          and(
            eq(inventorySuppliers.id, inventoryPurchaseOrders.supplierId),
            eq(
              inventorySuppliers.organizationId,
              inventoryPurchaseOrders.organizationId,
            ),
          ),
        )
        .leftJoin(users, eq(users.id, inventoryPurchaseOrders.createdByUserId))
        .where(eq(inventoryPurchaseOrders.organizationId, context.organizationId))
        .orderBy(desc(inventoryPurchaseOrders.createdAt))
        .limit(100),
      db
        .select({
          id: inventoryPurchaseOrderItems.id,
          purchaseOrderId: inventoryPurchaseOrderItems.purchaseOrderId,
          ingredientId: inventoryPurchaseOrderItems.ingredientId,
          ingredientName: inventoryIngredients.name,
          unit: inventoryIngredients.unit,
          orderedQuantity: inventoryPurchaseOrderItems.orderedQuantity,
          receivedQuantity: inventoryPurchaseOrderItems.receivedQuantity,
          unitCost: inventoryPurchaseOrderItems.unitCost,
          notes: inventoryPurchaseOrderItems.notes,
        })
        .from(inventoryPurchaseOrderItems)
        .innerJoin(
          inventoryIngredients,
          and(
            eq(inventoryIngredients.id, inventoryPurchaseOrderItems.ingredientId),
            eq(
              inventoryIngredients.organizationId,
              inventoryPurchaseOrderItems.organizationId,
            ),
          ),
        )
        .where(eq(inventoryPurchaseOrderItems.organizationId, context.organizationId))
        .orderBy(asc(inventoryPurchaseOrderItems.createdAt)),
      db
        .select({
          id: inventoryPurchaseOrderReceipts.id,
          purchaseOrderId: inventoryPurchaseOrderReceipts.purchaseOrderId,
          receivedByName: users.name,
          notes: inventoryPurchaseOrderReceipts.notes,
          createdAt: inventoryPurchaseOrderReceipts.createdAt,
        })
        .from(inventoryPurchaseOrderReceipts)
        .leftJoin(users, eq(users.id, inventoryPurchaseOrderReceipts.receivedByUserId))
        .where(
          eq(inventoryPurchaseOrderReceipts.organizationId, context.organizationId),
        )
        .orderBy(desc(inventoryPurchaseOrderReceipts.createdAt)),
      db
        .select({
          id: inventoryPurchaseOrderReceiptItems.id,
          receiptId: inventoryPurchaseOrderReceiptItems.receiptId,
          purchaseOrderItemId:
            inventoryPurchaseOrderReceiptItems.purchaseOrderItemId,
          ingredientName: inventoryIngredients.name,
          unit: inventoryIngredients.unit,
          quantity: inventoryPurchaseOrderReceiptItems.quantity,
        })
        .from(inventoryPurchaseOrderReceiptItems)
        .innerJoin(
          inventoryIngredients,
          and(
            eq(
              inventoryIngredients.id,
              inventoryPurchaseOrderReceiptItems.ingredientId,
            ),
            eq(
              inventoryIngredients.organizationId,
              inventoryPurchaseOrderReceiptItems.organizationId,
            ),
          ),
        )
        .where(
          eq(
            inventoryPurchaseOrderReceiptItems.organizationId,
            context.organizationId,
          ),
        )
        .orderBy(asc(inventoryPurchaseOrderReceiptItems.createdAt)),
    ]);

  const linesByOrder = new Map<string, PurchaseOrderLineRecord[]>();
  for (const item of itemRows) {
    const lines = linesByOrder.get(item.purchaseOrderId) ?? [];
    lines.push({
      id: item.id,
      ingredientId: item.ingredientId,
      ingredientName: item.ingredientName,
      unit: item.unit,
      orderedQuantity: item.orderedQuantity,
      receivedQuantity: item.receivedQuantity,
      outstandingQuantity: (
        Number(item.orderedQuantity) - Number(item.receivedQuantity)
      ).toFixed(3),
      unitCost: item.unitCost,
      notes: item.notes,
    });
    linesByOrder.set(item.purchaseOrderId, lines);
  }

  const receiptLinesByReceipt = new Map<
    string,
    PurchaseOrderReceiptRecord["lines"]
  >();
  for (const item of receiptItemRows) {
    const lines = receiptLinesByReceipt.get(item.receiptId) ?? [];
    lines.push({
      id: item.id,
      purchaseOrderItemId: item.purchaseOrderItemId,
      ingredientName: item.ingredientName,
      unit: item.unit,
      quantity: item.quantity,
    });
    receiptLinesByReceipt.set(item.receiptId, lines);
  }

  const receiptsByOrder = new Map<string, PurchaseOrderReceiptRecord[]>();
  for (const receipt of receiptRows) {
    const receipts = receiptsByOrder.get(receipt.purchaseOrderId) ?? [];
    receipts.push({
      id: receipt.id,
      receivedByName: receipt.receivedByName,
      notes: receipt.notes,
      createdAt: receipt.createdAt.toISOString(),
      lines: receiptLinesByReceipt.get(receipt.id) ?? [],
    });
    receiptsByOrder.set(receipt.purchaseOrderId, receipts);
  }

  return {
    suppliers: supplierRows.map((supplier) => ({
      id: supplier.id,
      name: supplier.name,
      contactName: supplier.contactName,
      email: supplier.email,
      phone: supplier.phone,
      accountReference: supplier.accountReference,
      notes: supplier.notes,
      isActive: supplier.isActive,
    })),
    ingredients: ingredientRows,
    purchaseOrders: orderRows.map((order) => {
      const lines = linesByOrder.get(order.id) ?? [];
      const hasUnknownCost = lines.some((line) => line.unitCost === null);
      const totalCost = hasUnknownCost
        ? null
        : lines
            .reduce(
              (total, line) =>
                total + Number(line.orderedQuantity) * Number(line.unitCost),
              0,
            )
            .toFixed(2);

      return {
        id: order.id,
        reference: formatPurchaseOrderReference(order.orderNumber),
        orderNumber: order.orderNumber,
        supplierId: order.supplierId,
        supplierName: order.supplierName,
        status: order.status as PurchaseOrderStatus,
        currency: order.currency,
        expectedOn: order.expectedOn,
        notes: order.notes,
        createdByName: order.createdByName,
        orderedAt: order.orderedAt?.toISOString() ?? null,
        receivedAt: order.receivedAt?.toISOString() ?? null,
        cancelledAt: order.cancelledAt?.toISOString() ?? null,
        createdAt: order.createdAt.toISOString(),
        totalCost,
        lines,
        receipts: receiptsByOrder.get(order.id) ?? [],
      };
    }),
  };
}

export async function saveInventorySupplier(
  context: TenantContext,
  input: unknown,
) {
  const parsed = inventorySupplierSchema.parse(input);
  const db = getDb();

  try {
    if (parsed.id) {
      const [updated] = await db
        .update(inventorySuppliers)
        .set({
          name: parsed.name,
          contactName: parsed.contactName,
          email: parsed.email,
          phone: parsed.phone,
          accountReference: parsed.accountReference,
          notes: parsed.notes,
          isActive: parsed.isActive,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(inventorySuppliers.id, parsed.id),
            eq(inventorySuppliers.organizationId, context.organizationId),
          ),
        )
        .returning({ id: inventorySuppliers.id });

      if (!updated) {
        throw new InventoryProcurementNotFoundError("Supplier not found.");
      }
    } else {
      await db.insert(inventorySuppliers).values({
        organizationId: context.organizationId,
        name: parsed.name,
        contactName: parsed.contactName,
        email: parsed.email,
        phone: parsed.phone,
        accountReference: parsed.accountReference,
        notes: parsed.notes,
        isActive: parsed.isActive,
      });
    }
  } catch (error) {
    if (hasPostgresErrorCode(error, "23505")) {
      throw new InventoryProcurementConflictError(
        "A supplier with this name already exists.",
      );
    }
    throw error;
  }

  return getInventoryProcurementConfiguration(context);
}

async function getNextPurchaseOrderNumber(
  transaction: TransactionClient,
  organizationId: string,
) {
  const [counter] = await transaction
    .insert(inventoryPurchaseOrderCounters)
    .values({ organizationId, lastNumber: 1 })
    .onConflictDoUpdate({
      target: inventoryPurchaseOrderCounters.organizationId,
      set: {
        lastNumber: sql`${inventoryPurchaseOrderCounters.lastNumber} + 1`,
        updatedAt: new Date(),
      },
    })
    .returning({ number: inventoryPurchaseOrderCounters.lastNumber });

  if (!counter) {
    throw new Error("Could not allocate a purchase-order number.");
  }
  return counter.number;
}

export async function createPurchaseOrder(
  context: TenantContext,
  input: unknown,
  actorUserId: string,
) {
  const parsed = purchaseOrderSchema.parse(input);
  const db = getDb();

  await db.transaction(async (transaction) => {
    const [[supplier], [organization], ingredientRows] = await Promise.all([
      transaction
        .select({ id: inventorySuppliers.id })
        .from(inventorySuppliers)
        .where(
          and(
            eq(inventorySuppliers.id, parsed.supplierId),
            eq(inventorySuppliers.organizationId, context.organizationId),
            eq(inventorySuppliers.isActive, true),
          ),
        )
        .limit(1),
      transaction
        .select({ currency: organizations.currency })
        .from(organizations)
        .where(eq(organizations.id, context.organizationId))
        .limit(1),
      transaction
        .select({ id: inventoryIngredients.id })
        .from(inventoryIngredients)
        .where(
          and(
            eq(inventoryIngredients.organizationId, context.organizationId),
            eq(inventoryIngredients.isActive, true),
            inArray(
              inventoryIngredients.id,
              parsed.lines.map((line) => line.ingredientId),
            ),
          ),
        ),
    ]);

    if (!supplier) {
      throw new InventoryProcurementNotFoundError("Active supplier not found.");
    }
    if (!organization) {
      throw new InventoryProcurementNotFoundError("Restaurant not found.");
    }
    if (ingredientRows.length !== parsed.lines.length) {
      throw new InventoryProcurementNotFoundError(
        "One or more active ingredients were not found.",
      );
    }

    const orderNumber = await getNextPurchaseOrderNumber(
      transaction,
      context.organizationId,
    );
    const [purchaseOrder] = await transaction
      .insert(inventoryPurchaseOrders)
      .values({
        organizationId: context.organizationId,
        supplierId: supplier.id,
        orderNumber,
        currency: organization.currency,
        expectedOn: parsed.expectedOn,
        notes: parsed.notes,
        createdByUserId: actorUserId,
      })
      .returning({ id: inventoryPurchaseOrders.id });

    await transaction.insert(inventoryPurchaseOrderItems).values(
      parsed.lines.map((line) => ({
        organizationId: context.organizationId,
        purchaseOrderId: purchaseOrder.id,
        ingredientId: line.ingredientId,
        orderedQuantity: line.orderedQuantity,
        unitCost: line.unitCost,
        notes: line.notes,
      })),
    );
  });

  return getInventoryProcurementConfiguration(context);
}

export async function updatePurchaseOrder(
  context: TenantContext,
  purchaseOrderId: string,
  input: unknown,
) {
  const parsed = purchaseOrderSchema.parse(input);
  const db = getDb();

  await db.transaction(async (transaction) => {
    const [purchaseOrder] = await transaction
      .select({ status: inventoryPurchaseOrders.status })
      .from(inventoryPurchaseOrders)
      .where(
        and(
          eq(inventoryPurchaseOrders.id, purchaseOrderId),
          eq(inventoryPurchaseOrders.organizationId, context.organizationId),
        ),
      )
      .for("update")
      .limit(1);

    if (!purchaseOrder) {
      throw new InventoryProcurementNotFoundError("Purchase order not found.");
    }
    if (purchaseOrder.status !== "DRAFT") {
      throw new InventoryProcurementConflictError(
        "Only a draft purchase order can be edited.",
      );
    }

    const [[supplier], ingredientRows] = await Promise.all([
      transaction
        .select({ id: inventorySuppliers.id })
        .from(inventorySuppliers)
        .where(
          and(
            eq(inventorySuppliers.id, parsed.supplierId),
            eq(inventorySuppliers.organizationId, context.organizationId),
            eq(inventorySuppliers.isActive, true),
          ),
        )
        .limit(1),
      transaction
        .select({ id: inventoryIngredients.id })
        .from(inventoryIngredients)
        .where(
          and(
            eq(inventoryIngredients.organizationId, context.organizationId),
            eq(inventoryIngredients.isActive, true),
            inArray(
              inventoryIngredients.id,
              parsed.lines.map((line) => line.ingredientId),
            ),
          ),
        ),
    ]);

    if (!supplier) {
      throw new InventoryProcurementNotFoundError("Active supplier not found.");
    }
    if (ingredientRows.length !== parsed.lines.length) {
      throw new InventoryProcurementNotFoundError(
        "One or more active ingredients were not found.",
      );
    }

    await transaction
      .update(inventoryPurchaseOrders)
      .set({
        supplierId: parsed.supplierId,
        expectedOn: parsed.expectedOn,
        notes: parsed.notes,
        updatedAt: new Date(),
      })
      .where(eq(inventoryPurchaseOrders.id, purchaseOrderId));
    await transaction
      .delete(inventoryPurchaseOrderItems)
      .where(
        and(
          eq(inventoryPurchaseOrderItems.purchaseOrderId, purchaseOrderId),
          eq(
            inventoryPurchaseOrderItems.organizationId,
            context.organizationId,
          ),
        ),
      );
    await transaction.insert(inventoryPurchaseOrderItems).values(
      parsed.lines.map((line) => ({
        organizationId: context.organizationId,
        purchaseOrderId,
        ingredientId: line.ingredientId,
        orderedQuantity: line.orderedQuantity,
        unitCost: line.unitCost,
        notes: line.notes,
      })),
    );
  });

  return getInventoryProcurementConfiguration(context);
}

export async function updatePurchaseOrderStatus(
  context: TenantContext,
  purchaseOrderId: string,
  input: unknown,
) {
  const parsed = purchaseOrderStatusSchema.parse(input);
  const db = getDb();

  await db.transaction(async (transaction) => {
    const [purchaseOrder] = await transaction
      .select({ status: inventoryPurchaseOrders.status })
      .from(inventoryPurchaseOrders)
      .where(
        and(
          eq(inventoryPurchaseOrders.id, purchaseOrderId),
          eq(inventoryPurchaseOrders.organizationId, context.organizationId),
        ),
      )
      .for("update")
      .limit(1);

    if (!purchaseOrder) {
      throw new InventoryProcurementNotFoundError("Purchase order not found.");
    }

    if (parsed.action === "ORDER") {
      if (purchaseOrder.status !== "DRAFT") {
        throw new InventoryProcurementConflictError(
          "Only a draft purchase order can be placed.",
        );
      }
      await transaction
        .update(inventoryPurchaseOrders)
        .set({ status: "ORDERED", orderedAt: new Date(), updatedAt: new Date() })
        .where(eq(inventoryPurchaseOrders.id, purchaseOrderId));
      return;
    }

    if (["CANCELLED", "RECEIVED"].includes(purchaseOrder.status)) {
      throw new InventoryProcurementConflictError(
        "This purchase order can no longer be cancelled.",
      );
    }
    await transaction
      .update(inventoryPurchaseOrders)
      .set({ status: "CANCELLED", cancelledAt: new Date(), updatedAt: new Date() })
      .where(eq(inventoryPurchaseOrders.id, purchaseOrderId));
  });

  return getInventoryProcurementConfiguration(context);
}

export async function receivePurchaseOrder(
  context: TenantContext,
  purchaseOrderId: string,
  input: unknown,
  actorUserId: string,
) {
  const parsed = purchaseOrderReceiptSchema.parse(input);
  const db = getDb();

  try {
    await db.transaction(async (transaction) => {
      const [duplicateReceipt] = await transaction
        .select({ id: inventoryPurchaseOrderReceipts.id })
        .from(inventoryPurchaseOrderReceipts)
        .where(
          and(
            eq(
              inventoryPurchaseOrderReceipts.organizationId,
              context.organizationId,
            ),
            eq(
              inventoryPurchaseOrderReceipts.idempotencyKey,
              parsed.idempotencyKey,
            ),
          ),
        )
        .limit(1);
      if (duplicateReceipt) return;

      const [purchaseOrder] = await transaction
        .select({
          id: inventoryPurchaseOrders.id,
          orderNumber: inventoryPurchaseOrders.orderNumber,
          status: inventoryPurchaseOrders.status,
        })
        .from(inventoryPurchaseOrders)
        .where(
          and(
            eq(inventoryPurchaseOrders.id, purchaseOrderId),
            eq(inventoryPurchaseOrders.organizationId, context.organizationId),
          ),
        )
        .for("update")
        .limit(1);

      if (!purchaseOrder) {
        throw new InventoryProcurementNotFoundError("Purchase order not found.");
      }
      if (!["ORDERED", "PARTIALLY_RECEIVED"].includes(purchaseOrder.status)) {
        throw new InventoryProcurementConflictError(
          "Only an ordered purchase order can receive stock.",
        );
      }

      const itemRows = await transaction
        .select({
          id: inventoryPurchaseOrderItems.id,
          ingredientId: inventoryPurchaseOrderItems.ingredientId,
          orderedQuantity: inventoryPurchaseOrderItems.orderedQuantity,
          receivedQuantity: inventoryPurchaseOrderItems.receivedQuantity,
        })
        .from(inventoryPurchaseOrderItems)
        .where(
          and(
            eq(inventoryPurchaseOrderItems.purchaseOrderId, purchaseOrderId),
            eq(
              inventoryPurchaseOrderItems.organizationId,
              context.organizationId,
            ),
            inArray(
              inventoryPurchaseOrderItems.id,
              parsed.lines.map((line) => line.purchaseOrderItemId),
            ),
          ),
        )
        .for("update");

      if (itemRows.length !== parsed.lines.length) {
        throw new InventoryProcurementNotFoundError(
          "One or more purchase-order lines were not found.",
        );
      }

      const itemById = new Map(itemRows.map((item) => [item.id, item]));
      for (const line of parsed.lines) {
        const item = itemById.get(line.purchaseOrderItemId)!;
        const outstanding =
          Number(item.orderedQuantity) - Number(item.receivedQuantity);
        if (Number(line.quantity) > outstanding) {
          throw new InventoryProcurementConflictError(
            "Received quantity cannot exceed the outstanding order quantity.",
          );
        }
      }

      const [receipt] = await transaction
        .insert(inventoryPurchaseOrderReceipts)
        .values({
          organizationId: context.organizationId,
          purchaseOrderId,
          idempotencyKey: parsed.idempotencyKey,
          receivedByUserId: actorUserId,
          notes: parsed.notes,
        })
        .returning({ id: inventoryPurchaseOrderReceipts.id });

      for (const line of parsed.lines) {
        const item = itemById.get(line.purchaseOrderItemId)!;
        const [updatedIngredient] = await transaction
          .update(inventoryIngredients)
          .set({
            currentQuantity: sql`${inventoryIngredients.currentQuantity} + ${line.quantity}`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(inventoryIngredients.id, item.ingredientId),
              eq(inventoryIngredients.organizationId, context.organizationId),
            ),
          )
          .returning({ currentQuantity: inventoryIngredients.currentQuantity });

        if (!updatedIngredient) {
          throw new InventoryProcurementNotFoundError("Ingredient not found.");
        }

        const quantityBefore = (
          Number(updatedIngredient.currentQuantity) - Number(line.quantity)
        ).toFixed(3);
        const [movement] = await transaction
          .insert(inventoryIngredientMovements)
          .values({
            organizationId: context.organizationId,
            ingredientId: item.ingredientId,
            movementType: "RECEIPT",
            quantityDelta: line.quantity,
            quantityBefore,
            quantityAfter: updatedIngredient.currentQuantity,
            reason: `Received against ${formatPurchaseOrderReference(
              purchaseOrder.orderNumber,
            )}`,
            referenceType: "PURCHASE_ORDER_RECEIPT",
            referenceId: receipt.id,
            recordedByUserId: actorUserId,
          })
          .returning({ id: inventoryIngredientMovements.id });

        await transaction
          .update(inventoryPurchaseOrderItems)
          .set({
            receivedQuantity: sql`${inventoryPurchaseOrderItems.receivedQuantity} + ${line.quantity}`,
            updatedAt: new Date(),
          })
          .where(eq(inventoryPurchaseOrderItems.id, item.id));

        await transaction.insert(inventoryPurchaseOrderReceiptItems).values({
          organizationId: context.organizationId,
          receiptId: receipt.id,
          purchaseOrderItemId: item.id,
          ingredientId: item.ingredientId,
          movementId: movement.id,
          quantity: line.quantity,
        });
      }

      const allItems = await transaction
        .select({
          orderedQuantity: inventoryPurchaseOrderItems.orderedQuantity,
          receivedQuantity: inventoryPurchaseOrderItems.receivedQuantity,
        })
        .from(inventoryPurchaseOrderItems)
        .where(
          and(
            eq(inventoryPurchaseOrderItems.purchaseOrderId, purchaseOrderId),
            eq(
              inventoryPurchaseOrderItems.organizationId,
              context.organizationId,
            ),
          ),
        );
      const isComplete = allItems.every(
        (item) => Number(item.receivedQuantity) === Number(item.orderedQuantity),
      );
      await transaction
        .update(inventoryPurchaseOrders)
        .set({
          status: isComplete ? "RECEIVED" : "PARTIALLY_RECEIVED",
          receivedAt: isComplete ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(eq(inventoryPurchaseOrders.id, purchaseOrderId));
    });
  } catch (error) {
    if (hasPostgresErrorCode(error, "23505")) {
      const [existingReceipt] = await db
        .select({ id: inventoryPurchaseOrderReceipts.id })
        .from(inventoryPurchaseOrderReceipts)
        .where(
          and(
            eq(
              inventoryPurchaseOrderReceipts.organizationId,
              context.organizationId,
            ),
            eq(
              inventoryPurchaseOrderReceipts.idempotencyKey,
              parsed.idempotencyKey,
            ),
          ),
        )
        .limit(1);
      if (!existingReceipt) throw error;
    } else {
      throw error;
    }
  }

  return getInventoryProcurementConfiguration(context);
}
