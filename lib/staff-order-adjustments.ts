import "server-only";

import { randomUUID } from "node:crypto";

import { and, desc, eq, inArray, ne } from "drizzle-orm";

import { getDb } from "@/db";
import { orderAdjustments, orderItems, orders } from "@/db/schema";
import { writeAuditLog } from "@/lib/audit-log";
import {
  assertManagerApproval,
  type ManagerApproval,
} from "@/lib/manager-approval";
import {
  calculateBasisPointsAmount,
  decimalToMinorUnits,
  minorUnitsToDecimal,
} from "@/lib/currency-money";
import {
  calculateDiscountedOrderFinancials,
  findActiveDiscountAdjustment,
  type StaffOrderAdjustmentReasonCode,
} from "@/lib/order-adjustments";
import {
  buildOrderFinancialSnapshot,
  emptyOrderFinancialSnapshot,
} from "@/lib/order-financial-snapshots";
import type { MembershipRole } from "@/lib/staff-auth";

type StaffAdjustmentActor = {
  id: string;
  organizationId?: string;
  role: MembershipRole;
  username?: string;
};

type AdjustmentTransaction = Parameters<
  Parameters<ReturnType<typeof getDb>["transaction"]>[0]
>[0];

export class StaffOrderAdjustmentError extends Error {
  status: number;

  constructor(message: string, status = 409) {
    super(message);
    this.name = "StaffOrderAdjustmentError";
    this.status = status;
  }
}

export async function getActiveStaffOrderAdjustment(
  tx: AdjustmentTransaction,
  orderId: string,
  organizationId: string,
) {
  const rows = await tx
    .select()
    .from(orderAdjustments)
    .where(
      and(
        eq(orderAdjustments.orderId, orderId),
        eq(orderAdjustments.organizationId, organizationId),
        eq(orderAdjustments.scope, "ORDER"),
        inArray(orderAdjustments.type, ["DISCOUNT", "COMP"]),
      ),
    )
    .orderBy(desc(orderAdjustments.createdAt));

  const active = findActiveDiscountAdjustment(rows);

  return active && (active.type === "DISCOUNT" || active.type === "COMP")
    ? { ...active, type: active.type }
    : null;
}

async function getAdjustmentBasis(
  tx: AdjustmentTransaction,
  orderId: string,
  organizationId: string,
  currency: string,
) {
  const items = await tx
    .select({
      taxAmount: orderItems.taxAmountSnapshot,
      taxableAmount: orderItems.taxableAmountSnapshot,
    })
    .from(orderItems)
    .where(
      and(
        eq(orderItems.orderId, orderId),
        eq(orderItems.organizationId, organizationId),
        ne(orderItems.status, "CANCELLED"),
      ),
    );

  if (items.length === 0) {
    throw new StaffOrderAdjustmentError("This order has no billable items.");
  }

  let subtotalAmountMinor = 0;
  let taxAmountMinor = 0;

  for (const item of items) {
    if (item.taxableAmount === null || item.taxAmount === null) {
      throw new StaffOrderAdjustmentError(
        "This order is missing its pricing snapshot and cannot be adjusted.",
      );
    }

    subtotalAmountMinor += decimalToMinorUnits(item.taxableAmount, currency);
    taxAmountMinor += decimalToMinorUnits(item.taxAmount, currency);
  }

  if (subtotalAmountMinor <= 0) {
    throw new StaffOrderAdjustmentError(
      "This order needs a positive subtotal before an adjustment can be applied.",
    );
  }

  return { subtotalAmountMinor, taxAmountMinor };
}

function assertAdjustableOrder(order: typeof orders.$inferSelect) {
  if (order.source !== "STAFF_CREATED") {
    throw new StaffOrderAdjustmentError(
      "Customer checkout orders cannot be adjusted after checkout starts.",
      403,
    );
  }

  if (!["PENDING", "PREPARING", "READY"].includes(order.status)) {
    throw new StaffOrderAdjustmentError("Only active orders can be adjusted.");
  }

  if (
    !["UNPAID", "NOT_REQUIRED"].includes(order.paymentStatus) ||
    Number(order.paymentCollectedAmount) > 0
  ) {
    throw new StaffOrderAdjustmentError(
      "Discounts and comps cannot change after payment collection starts.",
    );
  }
}

async function reverseAdjustment(
  tx: AdjustmentTransaction,
  adjustment: typeof orderAdjustments.$inferSelect,
  actor: StaffAdjustmentActor,
) {
  await tx.insert(orderAdjustments).values({
    actorType: "STAFF",
    actorUserId: actor.id,
    amount: adjustment.amount,
    basisAmount: adjustment.basisAmount,
    calculation: adjustment.calculation,
    currency: adjustment.currency,
    entryKind: "REVERSAL",
    idempotencyKey: randomUUID(),
    note: adjustment.note,
    orderId: adjustment.orderId,
    organizationId: adjustment.organizationId,
    rateBps: adjustment.rateBps,
    reasonCode: adjustment.reasonCode,
    reversesAdjustmentId: adjustment.id,
    scope: "ORDER",
    type: adjustment.type,
  });
}

function parseFixedDiscountAmount(value: string | undefined, currency: string) {
  try {
    return decimalToMinorUnits(value ?? "", currency);
  } catch {
    throw new StaffOrderAdjustmentError(
      "Enter a discount amount within the supported monetary range.",
      400,
    );
  }
}

export async function applyStaffOrderAdjustment(input: {
  actor: StaffAdjustmentActor;
  calculation: "FIXED_AMOUNT" | "PERCENTAGE";
  note?: string;
  managerApproval: ManagerApproval;
  orderId: string;
  organizationId: string;
  reasonCode: StaffOrderAdjustmentReasonCode;
  type: "DISCOUNT" | "COMP";
  value?: string;
}) {
  assertManagerApproval(input.managerApproval, input.organizationId);

  const result = await getDb().transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.id, input.orderId),
          eq(orders.organizationId, input.organizationId),
        ),
      )
      .limit(1)
      .for("update");

    if (!order) {
      throw new StaffOrderAdjustmentError("Order not found.", 404);
    }

    assertAdjustableOrder(order);

    const currency = order.paymentCurrency?.trim().toUpperCase();

    if (!currency) {
      throw new StaffOrderAdjustmentError("This order is missing its currency.");
    }

    const basis = await getAdjustmentBasis(
      tx,
      order.id,
      order.organizationId,
      currency,
    );
    const existing = await getActiveStaffOrderAdjustment(
      tx,
      order.id,
      order.organizationId,
    );

    if (existing) {
      await reverseAdjustment(tx, existing, input.actor);
    }

    const calculation = input.type === "COMP" ? "PERCENTAGE" : input.calculation;
    const rateBps =
      input.type === "COMP"
        ? 10_000
        : calculation === "PERCENTAGE"
          ? Math.round(Number(input.value) * 100)
          : null;
    const amountMinor =
      input.type === "COMP"
        ? basis.subtotalAmountMinor
        : calculation === "PERCENTAGE"
          ? calculateBasisPointsAmount(basis.subtotalAmountMinor, rateBps ?? 0)
          : parseFixedDiscountAmount(input.value, currency);

    if (
      amountMinor <= 0 ||
      (input.type === "DISCOUNT" &&
        (amountMinor >= basis.subtotalAmountMinor ||
          (rateBps !== null && rateBps >= 10_000)))
    ) {
      throw new StaffOrderAdjustmentError(
        "A discount must be greater than zero and less than the subtotal. Use comp to waive the full bill.",
        400,
      );
    }

    const adjusted = calculateDiscountedOrderFinancials({
      adjustment: {
        amountMinor,
        calculation,
        rateBps,
        type: input.type,
      },
      subtotalAmountMinor: basis.subtotalAmountMinor,
      taxAmountMinor: basis.taxAmountMinor,
    });
    const snapshot = buildOrderFinancialSnapshot({
      currency,
      discountAmountMinor: adjusted.discountAmountMinor,
      subtotalAmountMinor: basis.subtotalAmountMinor,
      taxAmountMinor: adjusted.taxAmountMinor,
    });
    const now = new Date();
    const [adjustment] = await tx
      .insert(orderAdjustments)
      .values({
        actorType: "STAFF",
        actorUserId: input.actor.id,
        amount: minorUnitsToDecimal(amountMinor, currency),
        basisAmount: minorUnitsToDecimal(basis.subtotalAmountMinor, currency),
        calculation,
        currency,
        idempotencyKey: randomUUID(),
        note: input.note?.trim() || null,
        orderId: order.id,
        organizationId: order.organizationId,
        rateBps,
        reasonCode: input.reasonCode,
        scope: "ORDER",
        type: input.type,
      })
      .returning();
    const [updatedOrder] = await tx
      .update(orders)
      .set({
        ...snapshot,
        financialSnapshotAt: null,
        paymentAmount: snapshot.finalTotalAmountSnapshot,
        paymentStatus: input.type === "COMP" ? "NOT_REQUIRED" : "UNPAID",
        updatedAt: now,
      })
      .where(
        and(
          eq(orders.id, order.id),
          eq(orders.organizationId, order.organizationId),
          eq(orders.paymentStatus, order.paymentStatus),
        ),
      )
      .returning();

    if (!updatedOrder) {
      throw new StaffOrderAdjustmentError(
        "The bill changed while the adjustment was being applied. Refresh and try again.",
      );
    }

    return { adjustment, order: updatedOrder, previousAdjustment: existing };
  });

  await writeAuditLog({
    actor: input.actor,
    organizationId: input.organizationId,
    action: input.type === "COMP" ? "order.comp_applied" : "order.discount_applied",
    entityType: "order",
    entityId: result.order.id,
    metadata: {
      adjustmentId: result.adjustment.id,
      amount: result.adjustment.amount,
      calculation: result.adjustment.calculation,
      note: result.adjustment.note,
      orderNo: result.order.orderNo,
      rateBps: result.adjustment.rateBps,
      reasonCode: result.adjustment.reasonCode,
      replacedAdjustmentId: result.previousAdjustment?.id ?? null,
      type: result.adjustment.type,
      approvedByUserId: input.managerApproval.approvedByUserId,
      approvedByUsername: input.managerApproval.approvedByUsername,
      approvalMode: input.managerApproval.mode,
    },
  });

  return result;
}

export async function removeStaffOrderAdjustment(input: {
  actor: StaffAdjustmentActor;
  managerApproval: ManagerApproval;
  orderId: string;
  organizationId: string;
}) {
  assertManagerApproval(input.managerApproval, input.organizationId);

  const result = await getDb().transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.id, input.orderId),
          eq(orders.organizationId, input.organizationId),
        ),
      )
      .limit(1)
      .for("update");

    if (!order) {
      throw new StaffOrderAdjustmentError("Order not found.", 404);
    }

    assertAdjustableOrder(order);
    const adjustment = await getActiveStaffOrderAdjustment(
      tx,
      order.id,
      order.organizationId,
    );

    if (!adjustment) {
      throw new StaffOrderAdjustmentError("This order has no active discount or comp.", 404);
    }

    await reverseAdjustment(tx, adjustment, input.actor);

    const currency = order.paymentCurrency?.trim().toUpperCase();

    if (!currency) {
      throw new StaffOrderAdjustmentError("This order is missing its currency.");
    }

    const basis = await getAdjustmentBasis(
      tx,
      order.id,
      order.organizationId,
      currency,
    );
    const paymentAmount = minorUnitsToDecimal(
      basis.subtotalAmountMinor + basis.taxAmountMinor,
      currency,
    );
    const [updatedOrder] = await tx
      .update(orders)
      .set({
        ...emptyOrderFinancialSnapshot,
        paymentAmount,
        paymentStatus: "UNPAID",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(orders.id, order.id),
          eq(orders.organizationId, order.organizationId),
          eq(orders.paymentStatus, order.paymentStatus),
        ),
      )
      .returning();

    if (!updatedOrder) {
      throw new StaffOrderAdjustmentError(
        "The bill changed while the adjustment was being removed. Refresh and try again.",
      );
    }

    return { adjustment, order: updatedOrder };
  });

  await writeAuditLog({
    actor: input.actor,
    organizationId: input.organizationId,
    action: "order.adjustment_removed",
    entityType: "order",
    entityId: result.order.id,
    metadata: {
      adjustmentId: result.adjustment.id,
      orderNo: result.order.orderNo,
      reasonCode: result.adjustment.reasonCode,
      type: result.adjustment.type,
      approvedByUserId: input.managerApproval.approvedByUserId,
      approvedByUsername: input.managerApproval.approvedByUsername,
      approvalMode: input.managerApproval.mode,
    },
  });

  return result;
}
