import "server-only";

import { and, asc, eq, inArray, lt, or } from "drizzle-orm";

import { getDb } from "@/db";
import {
  orderCustomerEmailDeliveries,
  orderRefunds,
  orders,
  organizations,
} from "@/db/schema";
import {
  buildOrderCancellationEmail,
  buildOrderConfirmationEmail,
  buildOrderRefundEmail,
  type OrderCustomerEmailContent,
  type OrderCustomerEmailSummary,
} from "@/lib/order-customer-email-format";
import { buildOrderReceiptEmail } from "@/lib/order-receipt-format";
import { getOrderReceipt } from "@/lib/order-receipts";
import { getOrderItems } from "@/lib/orders";
import { logError, logEvent } from "@/lib/logger";
import { resolveOrganizationEmailIntegration } from "@/lib/organization-integrations";
import { sendSmtp2goEmail } from "@/lib/smtp2go";

type DeliveryType =
  | "ORDER_CONFIRMATION"
  | "PAYMENT_RECEIPT"
  | "CANCELLATION"
  | "REFUND";

const MAX_DELIVERY_ATTEMPTS = 5;
const PROCESSING_TIMEOUT_MS = 10 * 60 * 1000;

async function getOrderEmailSummary(
  orderId: string,
  organizationId: string,
): Promise<{
  email: string;
  order: OrderCustomerEmailSummary;
  orderingPointId: string | null;
} | null> {
  const [record] = await getDb()
    .select({
      cancellationFeeAmount: orders.cancellationFeeAmount,
      currency: orders.paymentCurrency,
      customerEmail: orders.customerEmail,
      customerName: orders.customerName,
      fulfilmentType: orders.fulfilmentType,
      orderNo: orders.orderNo,
      orderingPointId: orders.orderingPointId,
      promisedFulfilmentAt: orders.promisedFulfilmentAt,
      refundAmount: orders.refundAmount,
      requestedFulfilmentAt: orders.requestedFulfilmentAt,
      restaurantName: organizations.name,
      timezone: organizations.timezone,
    })
    .from(orders)
    .innerJoin(organizations, eq(organizations.id, orders.organizationId))
    .where(
      and(
        eq(orders.id, orderId),
        eq(orders.organizationId, organizationId),
      ),
    )
    .limit(1);

  const email = record?.customerEmail?.trim().toLowerCase();

  if (!record || !email) {
    return null;
  }

  const items = await getOrderItems(orderId, {
    organizationId,
    orderingPointId: record.orderingPointId,
  });

  return {
    email,
    orderingPointId: record.orderingPointId,
    order: {
      cancellationFeeAmount: record.cancellationFeeAmount,
      currency: record.currency,
      customerName: record.customerName,
      fulfilmentType: record.fulfilmentType,
      items: items.map((item) => ({
        name: item.drinkName,
        quantity: item.quantity,
      })),
      orderNo: record.orderNo,
      promisedFulfilmentAt: record.promisedFulfilmentAt,
      refundAmount: record.refundAmount,
      requestedFulfilmentAt: record.requestedFulfilmentAt,
      restaurantName: record.restaurantName,
      timezone: record.timezone,
    },
  };
}

async function deliverQueuedEmail(deliveryId: string) {
  const claim = await getDb().transaction(async (tx) => {
    const [delivery] = await tx
      .select()
      .from(orderCustomerEmailDeliveries)
      .where(eq(orderCustomerEmailDeliveries.id, deliveryId))
      .limit(1)
      .for("update");

    if (
      !delivery ||
      delivery.status === "SENT" ||
      delivery.attemptCount >= MAX_DELIVERY_ATTEMPTS ||
      (delivery.status === "PROCESSING" &&
        delivery.lastAttemptAt &&
        delivery.lastAttemptAt > new Date(Date.now() - PROCESSING_TIMEOUT_MS))
    ) {
      return null;
    }

    const now = new Date();
    const [claimed] = await tx
      .update(orderCustomerEmailDeliveries)
      .set({
        attemptCount: delivery.attemptCount + 1,
        lastAttemptAt: now,
        lastError: null,
        status: "PROCESSING",
        updatedAt: now,
      })
      .where(eq(orderCustomerEmailDeliveries.id, delivery.id))
      .returning();

    return claimed ?? null;
  });

  if (!claim) {
    return false;
  }

  try {
    const integration = await resolveOrganizationEmailIntegration(
      claim.organizationId,
    );

    if (integration.status !== "CONFIGURED") {
      throw new Error(
        integration.status === "DISABLED"
          ? "Email delivery is disabled for this restaurant."
          : "Email delivery is not configured for this restaurant.",
      );
    }

    await sendSmtp2goEmail({
      apiKey: integration.apiKey,
      htmlBody: claim.htmlBody,
      replyToEmail: integration.replyToEmail,
      sender: integration.sender,
      subject: claim.subject,
      textBody: claim.textBody,
      to: claim.recipientEmail,
    });

    const now = new Date();
    await getDb()
      .update(orderCustomerEmailDeliveries)
      .set({ sentAt: now, status: "SENT", updatedAt: now })
      .where(eq(orderCustomerEmailDeliveries.id, claim.id));
    logEvent("info", "order.customer_email.sent", {
      attemptCount: claim.attemptCount,
      deliveryId: claim.id,
      orderId: claim.orderId,
      type: claim.type,
    });
    return true;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Customer email delivery failed.";
    const now = new Date();
    await getDb()
      .update(orderCustomerEmailDeliveries)
      .set({
        lastError: message.slice(0, 500),
        status: "FAILED",
        updatedAt: now,
      })
      .where(eq(orderCustomerEmailDeliveries.id, claim.id));
    logError("order.customer_email.failed", error, {
      attemptCount: claim.attemptCount,
      deliveryId: claim.id,
      orderId: claim.orderId,
      type: claim.type,
    });
    return false;
  }
}

async function queueEmail(input: {
  content: OrderCustomerEmailContent;
  eventKey: string;
  orderId: string;
  organizationId: string;
  recipientEmail: string;
  type: DeliveryType;
}) {
  const [inserted] = await getDb()
    .insert(orderCustomerEmailDeliveries)
    .values({
      eventKey: input.eventKey,
      htmlBody: input.content.htmlBody,
      orderId: input.orderId,
      organizationId: input.organizationId,
      recipientEmail: input.recipientEmail,
      subject: input.content.subject,
      textBody: input.content.textBody,
      type: input.type,
    })
    .onConflictDoNothing()
    .returning({ id: orderCustomerEmailDeliveries.id });
  const delivery = inserted
    ? inserted
    : (
        await getDb()
          .select({ id: orderCustomerEmailDeliveries.id })
          .from(orderCustomerEmailDeliveries)
          .where(
            and(
              eq(orderCustomerEmailDeliveries.organizationId, input.organizationId),
              eq(orderCustomerEmailDeliveries.eventKey, input.eventKey),
            ),
          )
          .limit(1)
      )[0];

  if (delivery) {
    await deliverQueuedEmail(delivery.id);
    await retryFailedOrderCustomerEmails(1);
  }
}

async function safelyQueue(callback: () => Promise<void>, fields: Record<string, unknown>) {
  try {
    await callback();
  } catch (error) {
    logError("order.customer_email.queue_failed", error, fields);
  }
}

export async function queueOrderConfirmationEmail(
  orderId: string,
  organizationId: string,
) {
  await safelyQueue(async () => {
    const summary = await getOrderEmailSummary(orderId, organizationId);

    if (!summary) return;

    await queueEmail({
      content: buildOrderConfirmationEmail(summary.order),
      eventKey: `order-confirmation:${orderId}`,
      orderId,
      organizationId,
      recipientEmail: summary.email,
      type: "ORDER_CONFIRMATION",
    });
  }, { orderId, organizationId, type: "ORDER_CONFIRMATION" });
}

export async function queueOrderPaymentReceiptEmail(
  orderId: string,
  organizationId: string,
  orderingPointId: string | null,
) {
  await safelyQueue(async () => {
    const receipt = await getOrderReceipt(orderId, {
      organizationId,
      orderingPointId,
    });

    if (!receipt?.customerEmail) return;

    const eventKey = `payment-receipt:${orderId}:${receipt.receiptNumber}`;
    const [existing] = await getDb()
      .select({ id: orderCustomerEmailDeliveries.id })
      .from(orderCustomerEmailDeliveries)
      .where(
        and(
          eq(orderCustomerEmailDeliveries.organizationId, organizationId),
          eq(orderCustomerEmailDeliveries.eventKey, eventKey),
        ),
      )
      .limit(1);

    if (!existing) {
      await queueEmail({
        content: buildOrderReceiptEmail(receipt),
        eventKey,
        orderId,
        organizationId,
        recipientEmail: receipt.customerEmail,
        type: "PAYMENT_RECEIPT",
      });
      return;
    }

    await deliverQueuedEmail(existing.id);
  }, { orderId, organizationId, type: "PAYMENT_RECEIPT" });
}

export async function queueOrderCancellationEmail(
  orderId: string,
  organizationId: string,
  cancellationId: string,
) {
  await safelyQueue(async () => {
    const summary = await getOrderEmailSummary(orderId, organizationId);

    if (!summary) return;

    await queueEmail({
      content: buildOrderCancellationEmail(summary.order),
      eventKey: `order-cancellation:${cancellationId}`,
      orderId,
      organizationId,
      recipientEmail: summary.email,
      type: "CANCELLATION",
    });
  }, { orderId, organizationId, type: "CANCELLATION" });
}

export async function queueOrderRefundEmail(
  refundId: string,
  orderId: string,
  organizationId: string,
) {
  await safelyQueue(async () => {
    const [refund, summary] = await Promise.all([
      getDb()
        .select({
          amount: orderRefunds.amount,
          currency: orderRefunds.currency,
          status: orderRefunds.status,
        })
        .from(orderRefunds)
        .where(
          and(
            eq(orderRefunds.id, refundId),
            eq(orderRefunds.organizationId, organizationId),
          ),
        )
        .limit(1)
        .then((rows) => rows[0] ?? null),
      getOrderEmailSummary(orderId, organizationId),
    ]);

    if (!refund || refund.status !== "SUCCEEDED" || !summary) return;

    await queueEmail({
      content: buildOrderRefundEmail(
        summary.order,
        refund.amount,
        refund.currency,
      ),
      eventKey: `order-refund:${refundId}`,
      orderId,
      organizationId,
      recipientEmail: summary.email,
      type: "REFUND",
    });
  }, { orderId, organizationId, refundId, type: "REFUND" });
}

export async function retryFailedOrderCustomerEmails(limit = 10) {
  const staleAt = new Date(Date.now() - PROCESSING_TIMEOUT_MS);
  const deliveries = await getDb()
    .select({ id: orderCustomerEmailDeliveries.id })
    .from(orderCustomerEmailDeliveries)
    .where(
      and(
        lt(orderCustomerEmailDeliveries.attemptCount, MAX_DELIVERY_ATTEMPTS),
        or(
          inArray(orderCustomerEmailDeliveries.status, ["PENDING", "FAILED"]),
          and(
            eq(orderCustomerEmailDeliveries.status, "PROCESSING"),
            lt(orderCustomerEmailDeliveries.lastAttemptAt, staleAt),
          ),
        ),
      ),
    )
    .orderBy(asc(orderCustomerEmailDeliveries.updatedAt))
    .limit(Math.max(1, Math.min(limit, 50)));

  for (const delivery of deliveries) {
    await deliverQueuedEmail(delivery.id);
  }

  return deliveries.length;
}
