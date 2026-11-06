import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

import {
  buildOrderCancellationEmail,
  buildOrderConfirmationEmail,
  buildOrderRefundEmail,
  type OrderCustomerEmailSummary,
} from "@/lib/order-customer-email-format";

function source(...segments: string[]) {
  return readFileSync(resolve(process.cwd(), ...segments), "utf8");
}

function orderFixture(): OrderCustomerEmailSummary {
  return {
    cancellationFeeAmount: "1.00",
    currency: "GBP",
    customerName: "A & B",
    fulfilmentType: "PICKUP",
    items: [{ name: "Lunch <special>", quantity: 2 }],
    orderNo: 12,
    promisedFulfilmentAt: null,
    refundAmount: "6.50",
    requestedFulfilmentAt: null,
    restaurantName: "Cafe & Co",
    timezone: "Europe/London",
  };
}

test.describe("automatic customer order emails", () => {
  test("builds escaped confirmation, cancellation and refund messages", () => {
    const order = orderFixture();
    const confirmation = buildOrderConfirmationEmail(order);
    const cancellation = buildOrderCancellationEmail(order);
    const refund = buildOrderRefundEmail(order, "6.50", "GBP");

    expect(confirmation.subject).toBe("Cafe & Co order #12 received");
    expect(confirmation.textBody).toContain("Lunch <special> x2");
    expect(confirmation.htmlBody).toContain("Lunch &lt;special&gt; x2");
    expect(confirmation.htmlBody).not.toContain("Lunch <special>");
    expect(cancellation.textBody).toContain("Cancellation fee: £1.00");
    expect(cancellation.textBody).toContain("confirmed separately");
    expect(refund.subject).toBe("Cafe & Co refund for order #12");
    expect(refund.textBody).toContain("refund of £6.50");
  });

  test("persists idempotent, retryable delivery records", () => {
    const schema = source("db", "schema.ts");
    const migration = source(
      "drizzle",
      "0087_order_customer_email_deliveries.sql",
    );
    const delivery = source("lib", "order-customer-emails.ts");

    expect(schema).toContain(
      'uniqueIndex("order_customer_email_deliveries_event_unique")',
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "order_customer_email_deliveries_event_unique"',
    );
    expect(delivery).toContain(".onConflictDoNothing()");
    expect(delivery).toContain('.for("update")');
    expect(delivery).toContain("MAX_DELIVERY_ATTEMPTS");
    expect(delivery).toContain('status: "FAILED"');
    expect(delivery).toContain('status: "SENT"');
  });

  test("queues each customer lifecycle event at its committed transition", () => {
    const createRoute = source("app", "api", "orders", "route.ts");
    const payments = source("lib", "order-payments.ts");
    const staffPayments = source("lib", "staff-order-payments.ts");
    const cancellation = source("lib", "order-cancellation.ts");

    expect(createRoute).toContain("queueOrderConfirmationEmail(");
    expect(payments).toContain("queueOrderPaymentReceiptEmail(");
    expect(staffPayments).toContain("queueOrderPaymentReceiptEmail(");
    expect(cancellation).toContain("queueOrderCancellationEmail(");
    expect(cancellation).toContain("queueOrderRefundEmail(");
  });

  test("uses the order email snapshot for guest receipts", () => {
    const receipts = source("lib", "order-receipts.ts");

    expect(receipts).toContain("orderCustomerEmail: orders.customerEmail");
    expect(receipts).toContain("record.orderCustomerEmail");
  });
});
