import { and, eq, isNull } from "drizzle-orm";
import type Stripe from "stripe";

import { getDb } from "@/db";
import { orderItems, orderPayments, orders } from "@/db/schema";
import { restoreReservedInventoryForOrderItem } from "@/lib/inventory";
import { getStripe } from "@/lib/stripe";
import type { TenantContext } from "@/lib/tenant-context";
import {
  decimalToMinorUnits,
  getCurrencyMinorUnitFactor,
} from "@/lib/currency-money";

export {
  decimalToMinorUnits,
  getCurrencyMinorUnitFactor,
  minorUnitsToDecimal,
} from "@/lib/currency-money";

export type OrderPaymentLine = {
  drinkName: string;
  modifiers: Array<{
    modifierName: string;
    priceDelta: string;
    quantity: number;
  }>;
  quantity: number;
  unitPrice: string | null;
};

export function buildOrderPaymentPricing(
  lines: OrderPaymentLine[],
  currency: string,
) {
  const normalizedCurrency = currency.trim().toUpperCase();
  const lineItems = lines.map((line) => {
    if (line.unitPrice === null) {
      throw new Error(`${line.drinkName} is not available for online payment.`);
    }

    const modifierAmount = line.modifiers.reduce(
      (total, modifier) =>
        total +
        decimalToMinorUnits(modifier.priceDelta, normalizedCurrency) *
          modifier.quantity,
      0,
    );
    const unitAmount =
      decimalToMinorUnits(line.unitPrice, normalizedCurrency) + modifierAmount;

    if (unitAmount <= 0) {
      throw new Error(`${line.drinkName} needs a valid price for online payment.`);
    }

    return {
      price_data: {
        currency: normalizedCurrency.toLowerCase(),
        product_data: {
          name: line.drinkName,
          ...(line.modifiers.length > 0
            ? {
                description: line.modifiers
                  .map((modifier) => modifier.modifierName)
                  .join(", ")
                  .slice(0, 200),
              }
            : {}),
        },
        unit_amount: unitAmount,
      },
      quantity: line.quantity,
    } satisfies Stripe.Checkout.SessionCreateParams.LineItem;
  });
  const amountTotalMinor = lineItems.reduce(
    (total, line) => total + (line.price_data?.unit_amount ?? 0) * (line.quantity ?? 1),
    0,
  );
  const factor = getCurrencyMinorUnitFactor(normalizedCurrency);

  return {
    amountTotal: (amountTotalMinor / factor).toFixed(factor === 1 ? 0 : 2),
    amountTotalMinor,
    currency: normalizedCurrency,
    lineItems,
  };
}

export async function createOrderCheckoutSession(input: {
  amountTotalMinor: number;
  applicationFeeBps: number;
  cancelUrl: string;
  customerEmail?: string | null;
  customerId?: string | null;
  expiresAt: Date;
  idempotencyKey?: string;
  lineItems: Stripe.Checkout.SessionCreateParams.LineItem[];
  orderId: string;
  paymentRecordId?: string | null;
  stripeAccountId: string;
  successUrl: string;
}) {
  const applicationFeeAmount = Math.round(
    (input.amountTotalMinor * input.applicationFeeBps) / 10_000,
  );
  const metadata = {
    orderId: input.orderId,
    ...(input.customerId ? { customerId: input.customerId } : {}),
    ...(input.paymentRecordId
      ? { paymentRecordId: input.paymentRecordId }
      : {}),
  };
  const session = await getStripe().checkout.sessions.create(
    {
      cancel_url: input.cancelUrl,
      client_reference_id: input.orderId,
      ...(input.customerEmail ? { customer_email: input.customerEmail } : {}),
      expires_at: Math.floor(input.expiresAt.getTime() / 1000),
      line_items: input.lineItems,
      metadata,
      mode: "payment",
      payment_intent_data: {
        ...(applicationFeeAmount > 0
          ? { application_fee_amount: applicationFeeAmount }
          : {}),
        metadata,
      },
      success_url: input.successUrl,
    },
    {
      idempotencyKey:
        input.idempotencyKey ?? `order-checkout-${input.orderId}`,
      stripeAccount: input.stripeAccountId,
    },
  );

  if (!session.url) {
    throw new Error("Stripe did not return a checkout URL.");
  }

  return session;
}

export async function markOrderPaymentPaid(
  session: Stripe.Checkout.Session,
  stripeConnectedAccountId: string | null = null,
) {
  const [order] = await getDb()
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.stripeCheckoutSessionId, session.id),
        stripeConnectedAccountId
          ? eq(orders.stripeConnectedAccountId, stripeConnectedAccountId)
          : isNull(orders.stripeConnectedAccountId),
      ),
    )
    .limit(1);

  if (!order || order.paymentStatus === "PAID") {
    return order ?? null;
  }

  if (order.paymentStatus !== "PENDING" || session.payment_status !== "paid") {
    return null;
  }

  const expectedAmount = order.paymentAmount
    ? decimalToMinorUnits(order.paymentAmount, order.paymentCurrency ?? "")
    : null;

  if (
    expectedAmount === null ||
    session.amount_total === null ||
    expectedAmount !== session.amount_total ||
    order.paymentCurrency?.toLowerCase() !== session.currency?.toLowerCase()
  ) {
    throw new Error(`Stripe payment amount mismatch for order ${order.id}.`);
  }

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;
  const updatedOrder = await getDb().transaction(async (tx) => {
    const now = new Date();
    const [nextOrder] = await tx
      .update(orders)
      .set({
        paidAt: now,
        paymentStatus: "PAID",
        stripePaymentIntentId: paymentIntentId,
        updatedAt: now,
      })
      .where(
        and(
          eq(orders.id, order.id),
          eq(orders.paymentStatus, "PENDING"),
        ),
      )
      .returning();

    if (!nextOrder) {
      return null;
    }

    await tx
      .update(orderPayments)
      .set({
        completedAt: now,
        status: "SUCCEEDED",
        stripePaymentIntentId: paymentIntentId,
        updatedAt: now,
      })
      .where(
        and(
          eq(orderPayments.orderId, order.id),
          eq(orderPayments.stripeCheckoutSessionId, session.id),
          eq(orderPayments.status, "PENDING"),
        ),
      );

    return nextOrder;
  });

  return updatedOrder ?? null;
}

async function cancelPendingOrderPaymentRecord(
  lookup:
    | { checkoutSessionId: string; stripeConnectedAccountId?: string | null }
    | { orderId: string },
  paymentStatus: "CANCELLED" | "FAILED",
) {
  return getDb().transaction(async (tx) => {
    const condition =
      "checkoutSessionId" in lookup
        ? and(
            eq(orders.stripeCheckoutSessionId, lookup.checkoutSessionId),
            lookup.stripeConnectedAccountId
              ? eq(
                  orders.stripeConnectedAccountId,
                  lookup.stripeConnectedAccountId,
                )
              : isNull(orders.stripeConnectedAccountId),
          )
        : eq(orders.id, lookup.orderId);
    const [lockedOrder] = await tx
      .select()
      .from(orders)
      .where(condition)
      .limit(1)
      .for("update");

    if (!lockedOrder || lockedOrder.paymentStatus !== "PENDING") {
      return null;
    }

    const now = new Date();
    const paymentRecordStatus =
      paymentStatus === "FAILED" ? "FAILED" : "CANCELLED";

    if (lockedOrder.source === "STAFF_CREATED") {
      const [order] = await tx
        .update(orders)
        .set({
          paymentAccountOrganizationId: null,
          paymentExpiresAt: null,
          paymentStatus: "UNPAID",
          stripeCheckoutSessionId: null,
          stripeConnectedAccountId: null,
          stripePaymentIntentId: null,
          updatedAt: now,
        })
        .where(
          and(
            eq(orders.id, lockedOrder.id),
            eq(orders.paymentStatus, "PENDING"),
          ),
        )
        .returning();

      if (!order) {
        return null;
      }

      await tx
        .update(orderPayments)
        .set({
          status: paymentRecordStatus,
          updatedAt: now,
        })
        .where(
          and(
            eq(orderPayments.orderId, order.id),
            eq(orderPayments.status, "PENDING"),
          ),
        );

      return order;
    }

    const [order] = await tx
      .update(orders)
      .set({
        cancelledAt: now,
        cancelReason:
          paymentStatus === "FAILED" ? "Payment failed" : "Payment session expired",
        paymentStatus,
        status: "CANCELLED",
        updatedAt: now,
      })
      .where(
        and(
          eq(orders.id, lockedOrder.id),
          eq(orders.status, "PENDING"),
          eq(orders.paymentStatus, "PENDING"),
        ),
      )
      .returning();

    if (!order) {
      return null;
    }

    await tx
      .update(orderPayments)
      .set({
        status: paymentRecordStatus,
        updatedAt: now,
      })
      .where(
        and(
          eq(orderPayments.orderId, order.id),
          eq(orderPayments.status, "PENDING"),
        ),
      );

    const tenantContext = {
      organizationId: order.organizationId,
      orderingPointId: order.orderingPointId,
    };
    const items = await tx
      .select()
      .from(orderItems)
      .where(
        and(
          eq(orderItems.orderId, order.id),
          eq(orderItems.organizationId, order.organizationId),
          eq(orderItems.status, "PENDING"),
        ),
      );

    for (const item of items.filter((current) => current.inventoryReservedAt)) {
      await restoreReservedInventoryForOrderItem(tx, tenantContext, item);
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
          eq(orderItems.organizationId, order.organizationId),
          eq(orderItems.status, "PENDING"),
        ),
      );

    return order;
  });
}

export function cancelPendingOrderPayment(
  checkoutSessionId: string,
  paymentStatus: "CANCELLED" | "FAILED",
  stripeConnectedAccountId: string | null = null,
) {
  return cancelPendingOrderPaymentRecord(
    { checkoutSessionId, stripeConnectedAccountId },
    paymentStatus,
  );
}

export function cancelPendingOrderPaymentByOrderId(
  orderId: string,
  paymentStatus: "CANCELLED" | "FAILED",
) {
  return cancelPendingOrderPaymentRecord({ orderId }, paymentStatus);
}

export async function getCustomerPaymentResult(
  customerId: string,
  checkoutSessionId: string,
  context: TenantContext,
) {
  const [order] = await getDb()
    .select({
      customerName: orders.customerName,
      orderId: orders.id,
      orderNo: orders.orderNo,
      paymentStatus: orders.paymentStatus,
      status: orders.status,
    })
    .from(orders)
    .where(
      and(
        eq(orders.customerId, customerId),
        eq(orders.stripeCheckoutSessionId, checkoutSessionId),
        eq(orders.organizationId, context.organizationId),
      ),
    )
    .limit(1);

  return order ?? null;
}
