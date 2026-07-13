import { and, eq } from "drizzle-orm";
import type Stripe from "stripe";

import { getDb } from "@/db";
import { orderItems, orders } from "@/db/schema";
import { restoreReservedInventoryForOrderItem } from "@/lib/inventory";
import { getStripe } from "@/lib/stripe";

const zeroDecimalCurrencies = new Set([
  "BIF",
  "CLP",
  "DJF",
  "GNF",
  "JPY",
  "KMF",
  "KRW",
  "MGA",
  "PYG",
  "RWF",
  "UGX",
  "VND",
  "VUV",
  "XAF",
  "XOF",
  "XPF",
]);

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

export function getCurrencyMinorUnitFactor(currency: string) {
  return zeroDecimalCurrencies.has(currency.toUpperCase()) ? 1 : 100;
}

function decimalToMinorUnits(value: string, currency: string) {
  const amount = Number(value);

  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("Order contains an invalid price.");
  }

  return Math.round(amount * getCurrencyMinorUnitFactor(currency));
}

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
  customerEmail: string;
  customerId: string;
  expiresAt: Date;
  lineItems: Stripe.Checkout.SessionCreateParams.LineItem[];
  orderId: string;
  origin: string;
}) {
  const session = await getStripe().checkout.sessions.create(
    {
      cancel_url: `${input.origin}/account?payment=cancelled`,
      client_reference_id: input.orderId,
      customer_email: input.customerEmail,
      expires_at: Math.floor(input.expiresAt.getTime() / 1000),
      line_items: input.lineItems,
      metadata: {
        customerId: input.customerId,
        orderId: input.orderId,
      },
      mode: "payment",
      payment_intent_data: {
        metadata: {
          customerId: input.customerId,
          orderId: input.orderId,
        },
      },
      success_url: `${input.origin}/order/payment/success?session_id={CHECKOUT_SESSION_ID}`,
    },
    { idempotencyKey: `order-checkout-${input.orderId}` },
  );

  if (!session.url) {
    throw new Error("Stripe did not return a checkout URL.");
  }

  return session;
}

export async function markOrderPaymentPaid(session: Stripe.Checkout.Session) {
  const [order] = await getDb()
    .select()
    .from(orders)
    .where(eq(orders.stripeCheckoutSessionId, session.id))
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
  const [updatedOrder] = await getDb()
    .update(orders)
    .set({
      paidAt: new Date(),
      paymentStatus: "PAID",
      stripePaymentIntentId: paymentIntentId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(orders.id, order.id),
        eq(orders.paymentStatus, "PENDING"),
      ),
    )
    .returning();

  return updatedOrder ?? null;
}

async function cancelPendingOrderPaymentRecord(
  lookup: { checkoutSessionId: string } | { orderId: string },
  paymentStatus: "CANCELLED" | "FAILED",
) {
  return getDb().transaction(async (tx) => {
    const condition =
      "checkoutSessionId" in lookup
        ? eq(orders.stripeCheckoutSessionId, lookup.checkoutSessionId)
        : eq(orders.id, lookup.orderId);
    const now = new Date();
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
      .where(and(condition, eq(orders.paymentStatus, "PENDING")))
      .returning();

    if (!order) {
      return null;
    }

    const tenantContext = {
      organizationId: order.organizationId,
      locationId: order.locationId,
    };
    const items = await tx
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id));

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
      .where(eq(orderItems.orderId, order.id));

    return order;
  });
}

export function cancelPendingOrderPayment(
  checkoutSessionId: string,
  paymentStatus: "CANCELLED" | "FAILED",
) {
  return cancelPendingOrderPaymentRecord({ checkoutSessionId }, paymentStatus);
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
      ),
    )
    .limit(1);

  return order ?? null;
}
