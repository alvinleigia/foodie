import { randomUUID } from "node:crypto";

import { and, desc, eq, or } from "drizzle-orm";
import type Stripe from "stripe";

import { getDb } from "@/db";
import {
  orderCancellations,
  orderItems,
  orderPayments,
  orderRefunds,
  orders,
} from "@/db/schema";
import { writeAuditLog } from "@/lib/audit-log";
import { restoreReservedInventoryForOrderItem } from "@/lib/inventory";
import { logError } from "@/lib/logger";
import {
  assertManagerApproval,
  type ManagerApproval,
} from "@/lib/manager-approval";
import { decimalToMinorUnits } from "@/lib/currency-money";
import {
  allocateRefundAcrossPayments,
  calculateCancellationAmounts,
} from "@/lib/order-cancellation-financials";
import type { MembershipRole } from "@/lib/staff-auth";
import { getStripe } from "@/lib/stripe";

type CancellationActorUser = {
  id: string;
  organizationId?: string;
  role: MembershipRole;
  username?: string;
};

type CancelOrderInput = {
  acknowledgedCancellationFeeBps?: number;
  actorType: "CUSTOMER" | "STAFF";
  actorUser?: CancellationActorUser | null;
  applyCustomerCancellationFee?: boolean;
  cancellationFeeBps?: number;
  cancelReason?: string | null;
  customerId?: string;
  customerToken?: string;
  managerApproval?: ManagerApproval;
  orderId: string;
  organizationId: string;
  overrideReason?: string | null;
  retryRefund?: boolean;
};

type RefundOperation = {
  order: typeof orders.$inferSelect;
  payment: typeof orderPayments.$inferSelect;
  refund: typeof orderRefunds.$inferSelect;
};

type CancellationTransaction = Parameters<
  Parameters<ReturnType<typeof getDb>["transaction"]>[0]
>[0];

export class OrderCancellationError extends Error {
  status: number;

  constructor(message: string, status = 409) {
    super(message);
    this.name = "OrderCancellationError";
    this.status = status;
  }
}

function normalizeBps(value: number) {
  if (!Number.isInteger(value) || value < 0 || value > 10_000) {
    throw new OrderCancellationError(
      "Cancellation fee must be between 0% and 100%.",
      400,
    );
  }

  return value;
}

function getCompletedRefundPaymentStatus(
  order: typeof orders.$inferSelect,
  refundedMinor: number,
) {
  if (!order.refundAmount || !order.paymentCurrency) {
    return "PARTIALLY_REFUNDED" as const;
  }

  const expectedRefundMinor = decimalToMinorUnits(
    order.refundAmount,
    order.paymentCurrency,
  );
  const collectedMinor = decimalToMinorUnits(
    order.paymentCollectedAmount,
    order.paymentCurrency,
  );

  return refundedMinor >= expectedRefundMinor && expectedRefundMinor >= collectedMinor
    ? ("REFUNDED" as const)
    : ("PARTIALLY_REFUNDED" as const);
}

async function updateOrderRefundStatus(
  tx: CancellationTransaction,
  orderId: string,
) {
  const [order] = await tx
    .select()
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1)
    .for("update");

  if (!order || !order.paymentCurrency || !order.refundAmount) {
    return order ?? null;
  }

  const attempts = await tx
    .select({
      amount: orderRefunds.amount,
      currency: orderRefunds.currency,
      status: orderRefunds.status,
    })
    .from(orderRefunds)
    .where(eq(orderRefunds.orderId, order.id));
  const succeededMinor = attempts
    .filter((attempt) => attempt.status === "SUCCEEDED")
    .reduce(
      (total, attempt) =>
        total + decimalToMinorUnits(attempt.amount, attempt.currency),
      0,
    );
  const expectedMinor = decimalToMinorUnits(
    order.refundAmount,
    order.paymentCurrency,
  );
  const nextPaymentStatus =
    succeededMinor >= expectedMinor
      ? getCompletedRefundPaymentStatus(order, succeededMinor)
      : attempts.some((attempt) => attempt.status === "PENDING")
        ? ("REFUND_PENDING" as const)
        : ("REFUND_FAILED" as const);
  const now = new Date();
  const [updatedOrder] = await tx
    .update(orders)
    .set({ paymentStatus: nextPaymentStatus, updatedAt: now })
    .where(eq(orders.id, order.id))
    .returning();

  return updatedOrder ?? order;
}

function mapStripeRefundStatus(status: string | null) {
  if (status === "succeeded") {
    return "SUCCEEDED" as const;
  }

  if (status === "failed" || status === "canceled") {
    return "FAILED" as const;
  }

  return "PENDING" as const;
}

async function getRefundOperation(refundId: string) {
  const [record] = await getDb()
    .select({
      order: orders,
      payment: orderPayments,
      refund: orderRefunds,
    })
    .from(orderRefunds)
    .innerJoin(orders, eq(orders.id, orderRefunds.orderId))
    .innerJoin(orderPayments, eq(orderPayments.id, orderRefunds.orderPaymentId))
    .where(eq(orderRefunds.id, refundId))
    .limit(1);

  return record ?? null;
}

async function setRefundAttemptFailed(
  operation: RefundOperation,
  failureReason: string,
) {
  const now = new Date();
  const result = await getDb().transaction(async (tx) => {
    const [failedRefund] = await tx
      .update(orderRefunds)
      .set({
        failureReason: failureReason.slice(0, 500),
        processedAt: now,
        status: "FAILED",
        updatedAt: now,
      })
      .where(
        and(
          eq(orderRefunds.id, operation.refund.id),
          eq(orderRefunds.status, "PENDING"),
        ),
      )
      .returning();

    if (!failedRefund) {
      return { failedRefund: null, order: operation.order };
    }

    return {
      failedRefund,
      order:
        (await updateOrderRefundStatus(tx, operation.order.id)) ??
        operation.order,
    };
  });

  if (!result.failedRefund) {
    const current = await getRefundOperation(operation.refund.id);
    return current?.order ?? operation.order;
  }

  await writeAuditLog({
    actor: null,
    organizationId: operation.order.organizationId,
    action: "order.refund.failed",
    entityType: "order_refund",
    entityId: operation.refund.id,
    metadata: {
      amount: operation.refund.amount,
      currency: operation.refund.currency,
      failureReason: failureReason.slice(0, 500),
      orderId: operation.order.id,
      orderNo: operation.order.orderNo,
    },
  });

  return result.order;
}

export async function syncOrderRefundFromStripe(
  stripeRefund: Stripe.Refund,
  stripeConnectedAccountId: string,
) {
  const metadataRefundId = stripeRefund.metadata?.refundRecordId;
  const lookup = metadataRefundId
    ? or(
        eq(orderRefunds.id, metadataRefundId),
        eq(orderRefunds.stripeRefundId, stripeRefund.id),
      )
    : eq(orderRefunds.stripeRefundId, stripeRefund.id);
  const [operation] = await getDb()
    .select({
      order: orders,
      payment: orderPayments,
      refund: orderRefunds,
    })
    .from(orderRefunds)
    .innerJoin(orders, eq(orders.id, orderRefunds.orderId))
    .innerJoin(orderPayments, eq(orderPayments.id, orderRefunds.orderPaymentId))
    .where(lookup)
    .limit(1);

  if (!operation) {
    return null;
  }

  if (
    operation.refund.provider !== "STRIPE" ||
    operation.payment.method !== "STRIPE_CHECKOUT"
  ) {
    throw new Error("Stripe refund is not linked to a Stripe payment.");
  }

  const paymentAccountId = operation.payment.stripeConnectedAccountId;

  if (paymentAccountId !== stripeConnectedAccountId) {
    throw new Error("Stripe refund account does not match the order account.");
  }

  const expectedMinor = decimalToMinorUnits(
    operation.refund.amount,
    operation.refund.currency,
  );

  if (
    expectedMinor !== stripeRefund.amount ||
    operation.refund.currency.toLowerCase() !== stripeRefund.currency.toLowerCase()
  ) {
    throw new Error(`Stripe refund amount mismatch for order ${operation.order.id}.`);
  }

  const nextRefundStatus = mapStripeRefundStatus(stripeRefund.status);
  const now = new Date();
  const statusChanged =
    operation.refund.status !== nextRefundStatus ||
    operation.refund.stripeRefundId !== stripeRefund.id;

  await getDb().transaction(async (tx) => {
    await tx
      .update(orderRefunds)
      .set({
        failureReason:
          nextRefundStatus === "FAILED"
            ? stripeRefund.failure_reason ?? "Stripe refund failed."
            : null,
        processedAt: nextRefundStatus === "PENDING" ? null : now,
        status: nextRefundStatus,
        stripeRefundId: stripeRefund.id,
        updatedAt: now,
      })
      .where(eq(orderRefunds.id, operation.refund.id));

    await updateOrderRefundStatus(tx, operation.order.id);
  });

  if (statusChanged) {
    await writeAuditLog({
      actor: null,
      organizationId: operation.order.organizationId,
      action: `order.refund.${nextRefundStatus.toLowerCase()}`,
      entityType: "order_refund",
      entityId: operation.refund.id,
      metadata: {
        amount: operation.refund.amount,
        currency: operation.refund.currency,
        orderId: operation.order.id,
        orderNo: operation.order.orderNo,
        stripeRefundId: stripeRefund.id,
      },
    });
  }

  const [updatedOrder] = await getDb()
    .select()
    .from(orders)
    .where(eq(orders.id, operation.order.id))
    .limit(1);

  return updatedOrder ?? operation.order;
}

async function executeRefund(refundId: string) {
  const operation = await getRefundOperation(refundId);

  if (!operation) {
    throw new OrderCancellationError("Refund record not found.", 404);
  }

  if (operation.refund.status !== "PENDING") {
    return {
      error: null,
      order: operation.order,
    };
  }

  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error("Stripe is not configured for refunds.");
    }

    if (
      operation.refund.provider !== "STRIPE" ||
      operation.payment.method !== "STRIPE_CHECKOUT"
    ) {
      throw new Error("Stripe refund is not linked to a Stripe payment.");
    }

    const stripeConnectedAccountId = operation.payment.stripeConnectedAccountId;
    const stripePaymentIntentId = operation.payment.stripePaymentIntentId;

    if (!stripeConnectedAccountId || !stripePaymentIntentId) {
      throw new Error("The Stripe payment reference is missing from this order.");
    }

    const stripeRefund = await getStripe().refunds.create(
      {
        amount: decimalToMinorUnits(
          operation.refund.amount,
          operation.refund.currency,
        ),
        metadata: {
          cancellationId: operation.refund.cancellationId,
          orderId: operation.order.id,
          refundRecordId: operation.refund.id,
        },
        payment_intent: stripePaymentIntentId,
        reason: "requested_by_customer",
        refund_application_fee: true,
      },
      {
        idempotencyKey: operation.refund.idempotencyKey,
        stripeAccount: stripeConnectedAccountId,
      },
    );
    const order = await syncOrderRefundFromStripe(
      stripeRefund,
      stripeConnectedAccountId,
    );

    if (!order) {
      throw new Error("The Stripe refund could not be matched to this order.");
    }

    return { error: null, order };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Stripe refund failed.";

    logError("order.refund.create_failed", error, {
      orderId: operation.order.id,
      refundId: operation.refund.id,
    });

    return {
      error: message,
      order: await setRefundAttemptFailed(operation, message),
    };
  }
}

async function executeRefunds(
  refundIds: string[],
  fallbackOrder: typeof orders.$inferSelect,
) {
  let order = fallbackOrder;
  const errors: string[] = [];

  for (const refundId of refundIds) {
    const result = await executeRefund(refundId);
    order = result.order;

    if (result.error) {
      errors.push(result.error);
    }
  }

  return {
    error: errors.length > 0 ? errors.join(" ") : null,
    order,
  };
}

async function prepareRefundRetry(input: CancelOrderInput) {
  const actorUser = input.actorUser;

  assertManagerApproval(input.managerApproval, input.organizationId);

  if (!actorUser) {
    throw new OrderCancellationError("Staff authorization is required.", 401);
  }

  return getDb().transaction(async (tx) => {
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
      throw new OrderCancellationError("Order not found.", 404);
    }

    if (order.status !== "CANCELLED" || order.paymentStatus !== "REFUND_FAILED") {
      throw new OrderCancellationError("This order does not have a failed refund.");
    }

    const attempts = await tx
      .select()
      .from(orderRefunds)
      .where(
        eq(orderRefunds.orderId, order.id),
      )
      .orderBy(desc(orderRefunds.requestedAt));
    const retryableRefunds: typeof orderRefunds.$inferSelect[] = [];
    const reviewedPaymentKeys = new Set<string>();

    for (const attempt of attempts) {
      if (attempt.status !== "FAILED" || attempt.provider !== "STRIPE") {
        continue;
      }

      const paymentKey = attempt.orderPaymentId;

      if (reviewedPaymentKeys.has(paymentKey)) {
        continue;
      }

      reviewedPaymentKeys.add(paymentKey);
      const hasActiveOrSuccessfulReplacement = attempts.some(
        (candidate) =>
          candidate.orderPaymentId === paymentKey &&
          (candidate.status === "PENDING" || candidate.status === "SUCCEEDED"),
      );

      if (!hasActiveOrSuccessfulReplacement) {
        retryableRefunds.push(attempt);
      }
    }

    if (retryableRefunds.length === 0) {
      throw new OrderCancellationError("No failed refund record was found.");
    }

    const now = new Date();
    const [updatedOrder] = await tx
      .update(orders)
      .set({ paymentStatus: "REFUND_PENDING", updatedAt: now })
      .where(
        and(
          eq(orders.id, order.id),
          eq(orders.paymentStatus, "REFUND_FAILED"),
        ),
      )
      .returning();

    if (!updatedOrder) {
      throw new OrderCancellationError("The refund is already being retried.");
    }

    const refunds: typeof orderRefunds.$inferSelect[] = [];

    for (const refund of retryableRefunds) {
      if (refund.stripeRefundId) {
        const nextRefundId = randomUUID();
        const [nextRefund] = await tx
          .insert(orderRefunds)
          .values({
            amount: refund.amount,
            cancellationId: refund.cancellationId,
            currency: refund.currency,
            id: nextRefundId,
            idempotencyKey: `order-refund-${order.id}-${nextRefundId}`,
            orderId: order.id,
            orderPaymentId: refund.orderPaymentId,
            organizationId: order.organizationId,
            provider: "STRIPE",
            requestedByUserId: actorUser.id,
          })
          .returning();

        refunds.push(nextRefund);
        continue;
      }

      const [retriedRefund] = await tx
        .update(orderRefunds)
        .set({
          failureReason: null,
          processedAt: null,
          status: "PENDING",
          updatedAt: now,
        })
        .where(
          and(
            eq(orderRefunds.id, refund.id),
            eq(orderRefunds.status, "FAILED"),
          ),
        )
        .returning();

      if (!retriedRefund) {
        throw new OrderCancellationError("The refund is already being retried.");
      }

      refunds.push(retriedRefund);
    }

    return { order: updatedOrder, refunds };
  });
}

export async function cancelOrder(input: CancelOrderInput) {
  if (input.retryRefund) {
    const retry = await prepareRefundRetry(input);

    for (const refund of retry.refunds) {
      await writeAuditLog({
        actor: input.actorUser ?? null,
        organizationId: input.organizationId,
        action: "order.refund.retry",
        entityType: "order_refund",
        entityId: refund.id,
        metadata: {
          approvedByUserId: input.managerApproval?.approvedByUserId ?? null,
          approvedByUsername: input.managerApproval?.approvedByUsername ?? null,
          approvalMode: input.managerApproval?.mode ?? null,
          orderId: retry.order.id,
          orderNo: retry.order.orderNo,
          orderPaymentId: refund.orderPaymentId,
        },
      });
    }

    return executeRefunds(
      retry.refunds.map((refund) => refund.id),
      retry.order,
    );
  }

  if (input.actorType === "STAFF") {
    assertManagerApproval(input.managerApproval, input.organizationId);
  }

  const prepared = await getDb().transaction(async (tx) => {
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
      throw new OrderCancellationError("Order not found.", 404);
    }

    if (
      input.actorType === "CUSTOMER" &&
      (input.customerToken !== order.customerToken ||
        !input.customerId ||
        input.customerId !== order.customerId)
    ) {
      throw new OrderCancellationError("Unauthorized", 401);
    }

    if (order.status === "CANCELLED") {
      return { cancellation: null, order, refunds: [] };
    }

    const isAllowedStatus =
      order.status === "PENDING" ||
      (input.actorType === "STAFF" &&
        (order.status === "PREPARING" || order.status === "READY"));

    if (!isAllowedStatus) {
      throw new OrderCancellationError(
        input.actorType === "CUSTOMER"
          ? "This order cannot be cancelled because preparation has already started."
          : "Staff cannot cancel an order after it has been delivered.",
      );
    }

    if (order.paymentStatus === "PENDING") {
      throw new OrderCancellationError(
        "Payment confirmation is still in progress. Refresh and try again shortly.",
      );
    }

    if (
      order.paymentStatus !== "PAID" &&
      order.paymentStatus !== "PARTIALLY_PAID" &&
      order.paymentStatus !== "UNPAID" &&
      order.paymentStatus !== "NOT_REQUIRED"
    ) {
      throw new OrderCancellationError(
        "This order cannot be cancelled in its current payment state.",
      );
    }

    const hasCollectedPayment =
      order.paymentStatus === "PAID" ||
      order.paymentStatus === "PARTIALLY_PAID";

    if (
      hasCollectedPayment &&
      (!order.paymentAmount ||
        !order.paymentCurrency ||
        Number(order.paymentCollectedAmount) <= 0)
    ) {
      throw new OrderCancellationError(
        "This order is missing collected payment details and must be reviewed before cancellation.",
      );
    }

    const disclosedFeeBps = normalizeBps(
      order.customerCancellationFeeBpsSnapshot,
    );

    if (
      input.actorType === "CUSTOMER" &&
      input.acknowledgedCancellationFeeBps !== disclosedFeeBps
    ) {
      throw new OrderCancellationError(
        "The cancellation policy changed. Refresh the order before confirming.",
      );
    }

    let appliedFeeBps = input.actorType === "CUSTOMER" ? disclosedFeeBps : 0;

    if (input.actorType === "STAFF" && input.applyCustomerCancellationFee) {
      if (order.status !== "PENDING") {
        throw new OrderCancellationError(
          "A customer cancellation fee can be applied only before preparation starts.",
          409,
        );
      }

      appliedFeeBps = normalizeBps(
        input.cancellationFeeBps ?? disclosedFeeBps,
      );

      if (appliedFeeBps > disclosedFeeBps) {
        throw new OrderCancellationError(
          "The cancellation fee cannot exceed the percentage shown to the customer.",
          400,
        );
      }

      if (
        appliedFeeBps < disclosedFeeBps &&
        !input.overrideReason?.trim()
      ) {
        throw new OrderCancellationError(
          "Add a reason for reducing or waiving the customer cancellation fee.",
          400,
        );
      }
    }

    const successfulPayments = hasCollectedPayment
      ? await tx
          .select()
          .from(orderPayments)
          .where(
            and(
              eq(orderPayments.orderId, order.id),
              eq(orderPayments.organizationId, order.organizationId),
              eq(orderPayments.status, "SUCCEEDED"),
            ),
          )
          .orderBy(desc(orderPayments.completedAt), desc(orderPayments.createdAt))
      : [];
    const financials =
      hasCollectedPayment && order.paymentCurrency
        ? calculateCancellationAmounts({
            amount: order.paymentCollectedAmount,
            currency: order.paymentCurrency,
            feeBps: appliedFeeBps,
          })
        : null;

    if (hasCollectedPayment && order.paymentCurrency) {
      const collectedMinor = decimalToMinorUnits(
        order.paymentCollectedAmount,
        order.paymentCurrency,
      );
      const recordedMinor = successfulPayments.reduce((total, payment) => {
        if (payment.currency !== order.paymentCurrency) {
          throw new OrderCancellationError(
            "The payment ledger currency does not match this order.",
          );
        }

        return (
          total + decimalToMinorUnits(payment.amount, order.paymentCurrency)
        );
      }, 0);

      if (recordedMinor !== collectedMinor) {
        throw new OrderCancellationError(
          "The collected payment ledger does not match this order and must be reviewed before cancellation.",
        );
      }
    }

    const refundAllocations =
      financials && financials.refundMinor > 0 && order.paymentCurrency
        ? allocateRefundAcrossPayments({
            currency: order.paymentCurrency,
            payments: successfulPayments.map((payment) => ({
              amount: payment.amount,
              id: payment.id,
              method: payment.method,
            })),
            refundAmount: financials.refundAmount,
          })
        : [];
    const hasStripeRefund = refundAllocations.some(
      (allocation) => allocation.method === "STRIPE_CHECKOUT",
    );
    const hasCashRefund = refundAllocations.some(
      (allocation) => allocation.method === "CASH",
    );
    const now = new Date();
    const [updatedOrder] = await tx
      .update(orders)
      .set({
        cancellationFeeAmount: financials?.feeAmount ?? null,
        cancellationFeeBpsApplied: appliedFeeBps,
        cancelledAt: now,
        cancelledByType: input.actorType,
        cancelledByUserId: input.actorUser?.id ?? null,
        cancelReason: input.cancelReason?.trim() || null,
        paymentStatus: hasStripeRefund
          ? "REFUND_PENDING"
          : hasCashRefund
            ? financials?.refundMinor === financials?.grossMinor
              ? "REFUNDED"
              : "PARTIALLY_REFUNDED"
            : order.paymentStatus,
        refundAmount: financials?.refundAmount ?? null,
        status: "CANCELLED",
        updatedAt: now,
      })
      .where(
        and(
          eq(orders.id, order.id),
          eq(orders.organizationId, input.organizationId),
          eq(orders.status, order.status),
          eq(orders.paymentStatus, order.paymentStatus),
        ),
      )
      .returning();

    if (!updatedOrder) {
      throw new OrderCancellationError(
        "The order changed while it was being cancelled. Refresh and try again.",
      );
    }

    const items = await tx
      .select()
      .from(orderItems)
      .where(
        and(
          eq(orderItems.orderId, order.id),
          eq(orderItems.organizationId, input.organizationId),
        ),
      );

    for (const item of items.filter(
      (current) => current.inventoryReservedAt && current.status !== "DELIVERED",
    )) {
      await restoreReservedInventoryForOrderItem(
        tx,
        {
          organizationId: order.organizationId,
          orderingPointId: order.orderingPointId,
        },
        item,
      );
    }

    await tx
      .update(orderItems)
      .set({
        cancelledAt: now,
        inventoryReservedAt: null,
        status: "CANCELLED",
        updatedAt: now,
      })
      .where(
        and(
          eq(orderItems.orderId, order.id),
          eq(orderItems.organizationId, input.organizationId),
        ),
      );

    const [cancellation] = await tx
      .insert(orderCancellations)
      .values({
        actorType: input.actorType,
        actorUserId: input.actorUser?.id ?? null,
        appliedFeeBps,
        currency: order.paymentCurrency,
        disclosedFeeBps,
        feeAmount: financials?.feeAmount ?? null,
        grossAmount: financials?.grossAmount ?? null,
        orderId: order.id,
        organizationId: order.organizationId,
        overrideReason:
          appliedFeeBps < disclosedFeeBps
            ? input.overrideReason?.trim() || input.cancelReason?.trim() || null
            : null,
        reason: input.cancelReason?.trim() || null,
        refundAmount: financials?.refundAmount ?? null,
      })
      .returning();
    const refunds: typeof orderRefunds.$inferSelect[] = [];

    for (const allocation of refundAllocations) {
      const refundId = randomUUID();
      const isCash = allocation.method === "CASH";
      const [refund] = await tx
        .insert(orderRefunds)
        .values({
          amount: allocation.amount,
          cancellationId: cancellation.id,
          currency: order.paymentCurrency!,
          id: refundId,
          idempotencyKey: `order-refund-${order.id}-${refundId}`,
          orderId: order.id,
          orderPaymentId: allocation.orderPaymentId,
          organizationId: order.organizationId,
          processedAt: isCash ? now : null,
          provider: isCash ? "CASH" : "STRIPE",
          requestedByUserId: input.actorUser?.id ?? null,
          status: isCash ? "SUCCEEDED" : "PENDING",
        })
        .returning();

      refunds.push(refund);
    }

    return { cancellation, order: updatedOrder, refunds };
  });

  if (!prepared.cancellation) {
    return { error: null, order: prepared.order };
  }

  await writeAuditLog({
    actor: input.actorUser ?? null,
    organizationId: input.organizationId,
    action:
      input.actorType === "CUSTOMER"
        ? "order.cancel.customer"
        : "order.cancel.staff",
    entityType: "order",
    entityId: prepared.order.id,
    metadata: {
      appliedFeeBps: prepared.cancellation.appliedFeeBps,
      disclosedFeeBps: prepared.cancellation.disclosedFeeBps,
      feeAmount: prepared.cancellation.feeAmount,
      orderNo: prepared.order.orderNo,
      refundAmount: prepared.cancellation.refundAmount,
      approvedByUserId: input.managerApproval?.approvedByUserId ?? null,
      approvedByUsername: input.managerApproval?.approvedByUsername ?? null,
      approvalMode: input.managerApproval?.mode ?? null,
    },
  });

  for (const refund of prepared.refunds.filter(
    (current) => current.provider === "CASH",
  )) {
    await writeAuditLog({
      actor: input.actorUser ?? null,
      organizationId: input.organizationId,
      action: "order.refund.succeeded",
      entityType: "order_refund",
      entityId: refund.id,
      metadata: {
        amount: refund.amount,
        currency: refund.currency,
        orderId: prepared.order.id,
        orderNo: prepared.order.orderNo,
        orderPaymentId: refund.orderPaymentId,
        provider: refund.provider,
      },
    });
  }

  const stripeRefunds = prepared.refunds.filter(
    (refund) => refund.provider === "STRIPE" && refund.status === "PENDING",
  );

  if (stripeRefunds.length === 0) {
    return { error: null, order: prepared.order };
  }

  return executeRefunds(
    stripeRefunds.map((refund) => refund.id),
    prepared.order,
  );
}
