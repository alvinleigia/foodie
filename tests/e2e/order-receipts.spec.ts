import fs from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import {
  buildOrderReceiptEmail,
  getReceiptItemTotal,
  type OrderReceipt,
} from "@/lib/order-receipt-format";

const root = process.cwd();

function source(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function receiptFixture(): OrderReceipt {
  return {
    cancellationFeeAmount: null,
    chargeAmount: "0.00",
    createdAt: new Date("2026-07-21T10:00:00.000Z"),
    currency: "GBP",
    customerEmail: "customer@example.com",
    customerName: "A & B",
    discountAmount: "0.00",
    finalTotalAmount: "7.50",
    items: [
      {
        drinkName: "Lunch <special>",
        modifiers: [
          { modifierName: "Extra sauce", priceDelta: "0.50", quantity: 1 },
        ],
        quantity: 2,
        unitPrice: "3.25",
      },
    ],
    orderDate: "2026-07-21",
    orderId: "order-1",
    orderNo: 12,
    payments: [
      {
        amount: "7.50",
        changeAmount: null,
        method: "STRIPE_CHECKOUT",
        tenderedAmount: null,
      },
    ],
    paymentStatus: "PAID",
    receiptIssuedAt: new Date("2026-07-21T10:01:00.000Z"),
    receiptNumber: 7,
    refundAmount: null,
    restaurantName: "Cafe & Co",
    restaurantSlug: "cafe-co",
    subtotalAmount: "7.50",
    taxAmount: "0.00",
    timezone: "Europe/London",
    tipAmount: "0.00",
  };
}

test.describe("order receipts", () => {
  test("calculates line totals with modifier snapshots", () => {
    const receipt = receiptFixture();

    expect(getReceiptItemTotal(receipt.items[0], receipt.currency)).toBe("7.50");
  });

  test("builds escaped receipt email content from financial snapshots", () => {
    const email = buildOrderReceiptEmail(receiptFixture());

    expect(email.subject).toBe("Cafe & Co receipt R-000007");
    expect(email.textBody).toContain("Total: £7.50");
    expect(email.htmlBody).toContain("Lunch &lt;special&gt;");
    expect(email.htmlBody).not.toContain("Lunch <special>");
  });

  test("scopes staff and customer receipt reads", () => {
    const loader = source("lib/order-receipts.ts");
    const staffPage = source(
      "app/restaurants/[restaurantSlug]/orders/[orderId]/receipt/page.tsx",
    );
    const customerPage = source("app/order/receipt/[orderId]/page.tsx");

    expect(loader).toContain("eq(orders.organizationId, context.organizationId)");
    expect(loader).toContain("eq(orders.organizationCustomerId, organizationCustomerId)");
    expect(staffPage).toContain("requireRestaurantWorkspaceAccess");
    expect(customerPage).toContain("requireCustomerSession");
    expect(customerPage).toContain("profile.id");
  });
});
