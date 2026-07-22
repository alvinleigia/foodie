import "server-only";

import { and, eq, inArray, ne } from "drizzle-orm";
import type Stripe from "stripe";

import { getDb } from "@/db";
import {
  cashDrawerSessions,
  orderItemModifiers,
  orderItems,
  orderPayments,
  orders,
} from "@/db/schema";
import { writeAuditLog } from "@/lib/audit-log";
import {
  calculateCashSettlement,
  calculatePaymentBalance,
} from "@/lib/order-payment-financials";
import {
  decimalToMinorUnits,
  minorUnitsToDecimal,
} from "@/lib/currency-money";
import {
  buildOrderPaymentPricing,
  cancelPendingOrderPaymentByOrderId,
  createOrderCheckoutSession,
  markOrderPaymentPaid,
} from "@/lib/order-payments";
import { resolveOrganizationPaymentIntegration } from "@/lib/organization-integrations";
import type { MembershipRole } from "@/lib/staff-auth";
import { getStripe } from "@/lib/stripe";
import { assertOrganizationFeaturesEnabled } from "@/lib/feature-entitlements";
import { getFinancialDocumentNumberUpdate } from "@/lib/financial-document-numbers";
import type { TaxPricingMode } from "@/lib/tax-pricing";
import {
  assertOrderFinancialSnapshotMatches,
  buildOrderFinancialSnapshot,
  getFinalizedOrderFinancialSnapshot,
} from "@/lib/order-financial-snapshots";
import { calculateDiscountedOrderFinancials } from "@/lib/order-adjustments";
import { getActiveStaffOrderAdjustment } from "@/lib/staff-order-adjustments";

type StaffPaymentActor = {
  id: string;
  organizationId?: string;
  role: MembershipRole;
  username?: string;
};

type PaymentTransaction = Parameters<
  Parameters<ReturnType<typeof getDb>["transaction"]>[0]
>[0];

export class StaffOrderPaymentError extends Error {
  status: number;

  constructor(message: string, status = 409) {
    super(message);
    this.name = "StaffOrderPaymentError";
    this.status = status;
  }
}

async function getCollectiblePricing(
  tx: PaymentTransaction,
  orderId: string,
  organizationId: string,
  currency: string,
  taxPricing: {
    pricingMode: TaxPricingMode;
    taxRateBps: number;
  },
) {
  const items = await tx
    .select()
    .from(orderItems)
    .where(
      and(
        eq(orderItems.orderId, orderId),
        eq(orderItems.organizationId, organizationId),
        ne(orderItems.status, "CANCELLED"),
      ),
    );

  if (items.length === 0) {
    throw new StaffOrderPaymentError(
      "This order has no items left to collect payment for.",
    );
  }

  const modifiers = await tx
    .select()
    .from(orderItemModifiers)
    .where(
      and(
        inArray(
          orderItemModifiers.orderItemId,
          items.map((item) => item.id),
        ),
        eq(orderItemModifiers.organizationId, organizationId),
      ),
    );
  const modifiersByItemId = new Map<
    string,
    Array<{
      modifierName: string;
      priceDelta: string;
      quantity: number;
    }>
  >();

  for (const modifier of modifiers) {
    const list = modifiersByItemId.get(modifier.orderItemId) ?? [];
    list.push({
      modifierName: modifier.modifierName,
      priceDelta: modifier.priceDelta,
      quantity: modifier.quantity,
    });
    modifiersByItemId.set(modifier.orderItemId, list);
  }

  try {
    return buildOrderPaymentPricing(
      items.map((item) => ({
        drinkName: item.drinkName,
        modifiers: modifiersByItemId.get(item.id) ?? [],
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
      currency,
      taxPricing,
    );
  } catch (error) {
    throw new StaffOrderPaymentError(
      error instanceof Error
        ? error.message.replace("online payment", "payment collection")
        : "This order cannot be priced for payment collection.",
    );
  }
}

function assertCollectibleStaffOrder(order: typeof orders.$inferSelect) {
  if (order.source !== "STAFF_CREATED") {
    throw new StaffOrderPaymentError(
      "Customer checkout payments are collected before the order is released.",
      403,
    );
  }

  if (order.status === "CANCELLED") {
    throw new StaffOrderPaymentError("A cancelled order cannot be paid.");
  }
}

function getPaymentBalance(
  order: typeof orders.$inferSelect,
  amount: string,
  currency: string,
) {
  const balance = calculatePaymentBalance({
    amount,
    collectedAmount: order.paymentCollectedAmount,
    currency,
  });

  if (
    balance.collectedMinor > 0 &&
    order.paymentAmount &&
    decimalToMinorUnits(order.paymentAmount, currency) !== balance.amountMinor
  ) {
    throw new StaffOrderPaymentError(
      "The bill total changed after payment collection started. Review the order before collecting more.",
    );
  }

  return balance;
}

async function resolveStaffOrderFinancialSnapshot(
  tx: PaymentTransaction,
  order: typeof orders.$inferSelect,
  pricing: ReturnType<typeof buildOrderPaymentPricing>,
) {
  const adjustment = await getActiveStaffOrderAdjustment(
    tx,
    order.id,
    order.organizationId,
  );
  const adjusted = calculateDiscountedOrderFinancials({
    adjustment: adjustment
      ? {
          amountMinor: decimalToMinorUnits(adjustment.amount, pricing.currency),
          calculation: adjustment.calculation,
          rateBps: adjustment.rateBps,
          type: adjustment.type,
        }
      : null,
    subtotalAmountMinor: pricing.taxableAmountMinor,
    taxAmountMinor: pricing.taxAmountMinor,
  });
  const expected = buildOrderFinancialSnapshot({
    currency: pricing.currency,
    discountAmountMinor: adjusted.discountAmountMinor,
    subtotalAmountMinor: pricing.taxableAmountMinor,
    taxAmountMinor: adjusted.taxAmountMinor,
  });
  const finalized = getFinalizedOrderFinancialSnapshot(order);

  if (finalized) {
    assertOrderFinancialSnapshotMatches({ current: finalized, expected });
  }

  return {
    isFinalized: finalized !== null,
    snapshot: finalized ?? expected,
  };
}

export async function collectStaffCashPayment(input: {
  actor: StaffPaymentActor;
  amount: string;
  orderId: string;
  organizationId: string;
  tenderedAmount: string;
}) {
  await assertOrganizationFeaturesEnabled(
    input.organizationId,
    ["payments.staff_billing"],
  );

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
      throw new StaffOrderPaymentError("Order not found.", 404);
    }

    assertCollectibleStaffOrder(order);

    if (
      order.paymentStatus !== "UNPAID" &&
      order.paymentStatus !== "PARTIALLY_PAID"
    ) {
      throw new StaffOrderPaymentError(
        order.paymentStatus === "PENDING"
          ? "Cancel the active online payment request before collecting cash."
          : "This bill is not available for another payment.",
      );
    }

    const currency = order.paymentCurrency?.trim().toUpperCase();

    if (!currency) {
      throw new StaffOrderPaymentError("This order is missing its currency.");
    }

    if (!order.orderingPointId) {
      throw new StaffOrderPaymentError(
        "This order is not assigned to an ordering point.",
      );
    }

    const [drawerSession] = await tx
      .select()
      .from(cashDrawerSessions)
      .where(
        and(
          eq(cashDrawerSessions.organizationId, order.organizationId),
          eq(cashDrawerSessions.orderingPointId, order.orderingPointId),
          eq(cashDrawerSessions.status, "OPEN"),
        ),
      )
      .limit(1)
      .for("update");

    if (!drawerSession) {
      throw new StaffOrderPaymentError(
        "Open the cash drawer before recording a cash payment.",
      );
    }

    if (drawerSession.currency !== currency) {
      throw new StaffOrderPaymentError(
        "The open cash drawer currency does not match this order.",
      );
    }

    const pricing = await getCollectiblePricing(
      tx,
      order.id,
      order.organizationId,
      currency,
      {
        pricingMode: order.taxPricingModeSnapshot,
        taxRateBps: order.taxRateBpsSnapshot,
      },
    );
    const financials = await resolveStaffOrderFinancialSnapshot(tx, order, pricing);
    const balance = getPaymentBalance(
      order,
      financials.snapshot.finalTotalAmountSnapshot,
      currency,
    );
    const amountMinor = decimalToMinorUnits(input.amount, currency);

    if (amountMinor <= 0 || amountMinor > balance.remainingMinor) {
      throw new StaffOrderPaymentError(
        "Enter an amount greater than zero and no more than the remaining balance.",
        400,
      );
    }

    const amount = minorUnitsToDecimal(amountMinor, currency);
    const cash = calculateCashSettlement({
      amount,
      currency,
      tenderedAmount: input.tenderedAmount,
    });
    const collectedMinor = balance.collectedMinor + amountMinor;
    const isPaid = collectedMinor === balance.amountMinor;
    const now = new Date();
    const financialDocumentUpdate = isPaid
      ? await getFinancialDocumentNumberUpdate(tx, order, now)
      : {};
    const [updatedOrder] = await tx
      .update(orders)
      .set({
        ...financialDocumentUpdate,
        ...(!financials.isFinalized
          ? { ...financials.snapshot, financialSnapshotAt: now }
          : {}),
        paidAt: isPaid ? now : null,
        paymentAmount: financials.snapshot.finalTotalAmountSnapshot,
        paymentCollectedAmount: minorUnitsToDecimal(collectedMinor, currency),
        paymentCurrency: currency,
        paymentStatus: isPaid ? "PAID" : "PARTIALLY_PAID",
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
      throw new StaffOrderPaymentError(
        "The bill changed while cash was being recorded. Refresh and try again.",
      );
    }

    const [payment] = await tx
      .insert(orderPayments)
      .values({
        amount,
        cashDrawerSessionId: drawerSession.id,
        changeAmount: cash.changeAmount,
        completedAt: now,
        currency,
        method: "CASH",
        orderId: order.id,
        organizationId: order.organizationId,
        receivedByUserId: input.actor.id,
        status: "SUCCEEDED",
        tenderedAmount: cash.tenderedAmount,
      })
      .returning();

    return { order: updatedOrder, payment };
  });

  await writeAuditLog({
    actor: input.actor,
    organizationId: input.organizationId,
    action: "order.payment.cash_received",
    entityType: "order_payment",
    entityId: result.payment.id,
    metadata: {
      amount: result.payment.amount,
      changeAmount: result.payment.changeAmount,
      currency: result.payment.currency,
      orderId: result.order.id,
      orderNo: result.order.orderNo,
      tenderedAmount: result.payment.tenderedAmount,
    },
  });

  return result;
}

async function getStaffOrder(orderId: string, organizationId: string) {
  const [order] = await getDb()
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.id, orderId),
        eq(orders.organizationId, organizationId),
      ),
    )
    .limit(1);

  if (!order) {
    throw new StaffOrderPaymentError("Order not found.", 404);
  }

  assertCollectibleStaffOrder(order);
  return order;
}

export async function createStaffStripeCheckout(input: {
  actor: StaffPaymentActor;
  cancelUrl: string;
  orderId: string;
  organizationId: string;
  successUrl: string;
}) {
  let order = await getStaffOrder(input.orderId, input.organizationId);

  if (order.paymentStatus === "PAID") {
    return { checkoutUrl: null, order };
  }

  if (order.paymentStatus === "PENDING") {
    if (!order.stripeCheckoutSessionId || !order.stripeConnectedAccountId) {
      throw new StaffOrderPaymentError(
        "The payment link is still being created. Try again shortly.",
      );
    }

    const session = await getStripe().checkout.sessions.retrieve(
      order.stripeCheckoutSessionId,
      {},
      { stripeAccount: order.stripeConnectedAccountId },
    );

    if (session.payment_status === "paid") {
      const paidOrder = await markOrderPaymentPaid(
        session,
        order.stripeConnectedAccountId,
      );
      return { checkoutUrl: null, order: paidOrder ?? order };
    }

    if (session.status === "open" && session.url) {
      return { checkoutUrl: session.url, order };
    }

    if (session.status === "complete") {
      return { checkoutUrl: null, order };
    }

    await cancelPendingOrderPaymentByOrderId(order.id, "CANCELLED");
    order = await getStaffOrder(input.orderId, input.organizationId);
  }

  if (
    order.paymentStatus !== "UNPAID" &&
    order.paymentStatus !== "PARTIALLY_PAID"
  ) {
    throw new StaffOrderPaymentError("This bill is not available for payment.");
  }

  await assertOrganizationFeaturesEnabled(
    input.organizationId,
    ["payments.staff_billing", "payments.stripe"],
  );

  if (!process.env.STRIPE_SECRET_KEY) {
    throw new StaffOrderPaymentError(
      "Online payment is temporarily unavailable.",
      503,
    );
  }

  const integration = await resolveOrganizationPaymentIntegration(
    input.organizationId,
  );

  if (integration.status !== "CONFIGURED") {
    throw new StaffOrderPaymentError(
      "This restaurant has no active Stripe account.",
      503,
    );
  }

  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const prepared = await getDb().transaction(async (tx) => {
    const [lockedOrder] = await tx
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

    if (!lockedOrder) {
      throw new StaffOrderPaymentError("Order not found.", 404);
    }

    assertCollectibleStaffOrder(lockedOrder);

    if (
      lockedOrder.paymentStatus !== "UNPAID" &&
      lockedOrder.paymentStatus !== "PARTIALLY_PAID"
    ) {
      throw new StaffOrderPaymentError(
        "The bill changed while its payment link was being created. Refresh and try again.",
      );
    }

    const currency = lockedOrder.paymentCurrency?.trim().toUpperCase();

    if (!currency) {
      throw new StaffOrderPaymentError("This order is missing its currency.");
    }

    const pricing = await getCollectiblePricing(
      tx,
      lockedOrder.id,
      lockedOrder.organizationId,
      currency,
      {
        pricingMode: lockedOrder.taxPricingModeSnapshot,
        taxRateBps: lockedOrder.taxRateBpsSnapshot,
      },
    );
    const financials = await resolveStaffOrderFinancialSnapshot(
      tx,
      lockedOrder,
      pricing,
    );
    const balance = getPaymentBalance(
      lockedOrder,
      financials.snapshot.finalTotalAmountSnapshot,
      currency,
    );

    if (balance.remainingMinor <= 0) {
      throw new StaffOrderPaymentError("This bill has already been paid.");
    }

    const remainingLineItems = [
      {
        price_data: {
          currency: currency.toLowerCase(),
          product_data: {
            name: `Order #${lockedOrder.orderNo} remaining balance`,
          },
          unit_amount: balance.remainingMinor,
        },
        quantity: 1,
      },
    ] satisfies Stripe.Checkout.SessionCreateParams.LineItem[];
    const now = new Date();
    const [payment] = await tx
      .insert(orderPayments)
      .values({
        amount: balance.remainingAmount,
        currency,
        method: "STRIPE_CHECKOUT",
        orderId: lockedOrder.id,
        organizationId: lockedOrder.organizationId,
        status: "PENDING",
        stripeConnectedAccountId: integration.stripeAccountId,
      })
      .returning();
    const [updatedOrder] = await tx
      .update(orders)
      .set({
        ...(!financials.isFinalized ? financials.snapshot : {}),
        paymentAccountOrganizationId: integration.organizationId,
        paymentAmount: financials.snapshot.finalTotalAmountSnapshot,
        paymentCurrency: currency,
        paymentExpiresAt: expiresAt,
        paymentStatus: "PENDING",
        stripeCheckoutSessionId: null,
        stripeConnectedAccountId: integration.stripeAccountId,
        stripePaymentIntentId: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(orders.id, lockedOrder.id),
          eq(orders.paymentStatus, lockedOrder.paymentStatus),
        ),
      )
      .returning();

    if (!updatedOrder) {
      throw new StaffOrderPaymentError(
        "The bill changed while its payment link was being created. Refresh and try again.",
      );
    }

    return {
      lineItems: remainingLineItems,
      order: updatedOrder,
      payment,
      remainingMinor: balance.remainingMinor,
    };
  });

  let checkoutSessionId: string | null = null;

  try {
    const session = await createOrderCheckoutSession({
      amountTotalMinor: prepared.remainingMinor,
      applicationFeeBps: integration.applicationFeeBps,
      cancelUrl: input.cancelUrl,
      expiresAt,
      idempotencyKey: `staff-order-checkout-${prepared.payment.id}`,
      lineItems: prepared.lineItems,
      orderId: prepared.order.id,
      paymentRecordId: prepared.payment.id,
      stripeAccountId: integration.stripeAccountId,
      successUrl: input.successUrl,
    });
    checkoutSessionId = session.id;
    const linkedOrder = await getDb().transaction(async (tx) => {
      const now = new Date();
      const [updatedOrder] = await tx
        .update(orders)
        .set({
          stripeCheckoutSessionId: session.id,
          updatedAt: now,
        })
        .where(
          and(
            eq(orders.id, prepared.order.id),
            eq(orders.paymentStatus, "PENDING"),
          ),
        )
        .returning();

      if (!updatedOrder) {
        throw new StaffOrderPaymentError(
          "Payment session could not be linked to the bill.",
        );
      }

      await tx
        .update(orderPayments)
        .set({
          stripeCheckoutSessionId: session.id,
          updatedAt: now,
        })
        .where(
          and(
            eq(orderPayments.id, prepared.payment.id),
            eq(orderPayments.status, "PENDING"),
          ),
        );

      return updatedOrder;
    });

    await writeAuditLog({
      actor: input.actor,
      organizationId: input.organizationId,
      action: "order.payment.checkout_created",
      entityType: "order_payment",
      entityId: prepared.payment.id,
      metadata: {
        amount: prepared.payment.amount,
        currency: prepared.payment.currency,
        orderId: prepared.order.id,
        orderNo: prepared.order.orderNo,
      },
    });

    return { checkoutUrl: session.url, order: linkedOrder };
  } catch (error) {
    if (checkoutSessionId) {
      await getStripe()
        .checkout.sessions.expire(
          checkoutSessionId,
          {},
          { stripeAccount: integration.stripeAccountId },
        )
        .catch(() => null);
    }

    await cancelPendingOrderPaymentByOrderId(prepared.order.id, "FAILED").catch(
      () => null,
    );
    throw error;
  }
}

export async function cancelStaffStripeCheckout(input: {
  actor: StaffPaymentActor;
  orderId: string;
  organizationId: string;
}) {
  const order = await getStaffOrder(input.orderId, input.organizationId);

  if (
    order.paymentStatus === "UNPAID" ||
    order.paymentStatus === "PARTIALLY_PAID"
  ) {
    return order;
  }

  if (
    order.paymentStatus !== "PENDING" ||
    !order.stripeCheckoutSessionId ||
    !order.stripeConnectedAccountId
  ) {
    throw new StaffOrderPaymentError(
      "This order does not have an open online payment request.",
    );
  }

  const session = await getStripe().checkout.sessions.retrieve(
    order.stripeCheckoutSessionId,
    {},
    { stripeAccount: order.stripeConnectedAccountId },
  );

  if (session.payment_status === "paid") {
    return (
      (await markOrderPaymentPaid(session, order.stripeConnectedAccountId)) ??
      order
    );
  }

  if (session.status === "complete") {
    throw new StaffOrderPaymentError(
      "Stripe is already confirming this payment and it can no longer be cancelled.",
    );
  }

  if (session.status === "open") {
    await getStripe().checkout.sessions.expire(
      session.id,
      {},
      { stripeAccount: order.stripeConnectedAccountId },
    );
  }

  const updatedOrder = await cancelPendingOrderPaymentByOrderId(
    order.id,
    "CANCELLED",
  );

  if (!updatedOrder) {
    throw new StaffOrderPaymentError(
      "The payment request changed. Refresh the order panel.",
    );
  }

  await writeAuditLog({
    actor: input.actor,
    organizationId: input.organizationId,
    action: "order.payment.checkout_cancelled",
    entityType: "order",
    entityId: order.id,
    metadata: {
      orderNo: order.orderNo,
      stripeCheckoutSessionId: order.stripeCheckoutSessionId,
    },
  });

  return updatedOrder;
}
