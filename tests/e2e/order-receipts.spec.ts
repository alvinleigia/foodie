import fs from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import {
  aggregateReceiptTaxComponents,
  buildOrderReceiptEmail,
  getReceiptItemTotal,
  getVatNetUnitPrice,
  type OrderReceipt,
} from "@/lib/order-receipt-format";
import { vatInvoiceRequestSchema } from "@/lib/validations/vat-invoice";
import { buildOrderReceiptPdf } from "@/lib/order-receipt-pdf";

const root = process.cwd();

function source(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function receiptFixture(): OrderReceipt {
  return {
    canIssueSimplifiedVatInvoice: false,
    canIssueVatInvoice: false,
    cancellationFeeAmount: null,
    chargeAmount: "0.00",
    createdAt: new Date("2026-07-21T10:00:00.000Z"),
    currency: "GBP",
    customerEmail: "customer@example.com",
    customerName: "A & B",
    discountAmount: "0.00",
    finalTotalAmount: "7.50",
    footerMessage: null,
    fulfilmentType: "PICKUP",
    requestedFulfilmentAt: null,
    promisedFulfilmentAt: null,
    invoiceCustomerAddressLine1: null,
    invoiceCustomerAddressLine2: null,
    invoiceCustomerCity: null,
    invoiceCustomerCountryCode: null,
    invoiceCustomerName: null,
    invoiceCustomerPostalCode: null,
    invoiceCustomerRegion: null,
    invoiceIssuedAt: null,
    invoiceNumber: null,
    invoiceSupplierAddressLine1: null,
    invoiceSupplierAddressLine2: null,
    invoiceSupplierCity: null,
    invoiceSupplierCountryCode: null,
    invoiceSupplierName: null,
    invoiceSupplierPostalCode: null,
    invoiceSupplierRegion: null,
    invoiceSupplierVatNumber: null,
    invoiceTaxPointAt: null,
    items: [
      {
        drinkName: "Lunch <special>",
        modifiers: [
          { modifierName: "Extra sauce", priceDelta: "0.50", quantity: 1 },
        ],
        quantity: 2,
        taxableAmount: "7.50",
        taxAmount: "0.00",
        taxRateBps: 0,
        taxComponents: [],
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
    receiptPrintFormat: "THERMAL_80MM",
    refundAmount: null,
    restaurantName: "Cafe & Co",
    restaurantSlug: "cafe-co",
    subtotalAmount: "7.50",
    taxAmount: "0.00",
    taxRateBps: 0,
    taxSummary: [],
    timezone: "Europe/London",
    tipAmount: "0.00",
    vatInvoiceType: null,
  };
}

test.describe("order receipts", () => {
  test("generates a downloadable PDF using the receipt snapshots", async ({}, testInfo) => {
    const pdf = await buildOrderReceiptPdf(receiptFixture());
    expect(pdf.subarray(0, 8).toString()).toBe("%PDF-1.3");
    expect(pdf.toString("latin1")).toContain("Receipt R-000007");
    expect(pdf.toString("latin1").match(/\/Type \/Page\b/g)).toHaveLength(1);
    fs.writeFileSync(testInfo.outputPath("receipt.pdf"), pdf);
  });

  test("paginates long orders without dropping the final totals", async ({}, testInfo) => {
    const receipt = receiptFixture();
    receipt.items = Array.from({ length: 70 }, (_, index) => ({
      ...receipt.items[0],
      drinkName: `Menu item ${index + 1} with a long descriptive name that wraps onto another line`,
    }));
    receipt.subtotalAmount = receipt.finalTotalAmount = "525.00";
    receipt.payments[0].amount = "525.00";
    const pdf = await buildOrderReceiptPdf(receipt);
    expect((pdf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length).toBeGreaterThan(1);
    fs.writeFileSync(testInfo.outputPath("long-receipt.pdf"), pdf);
  });

  test("embeds fonts for accented names and non-GBP currency symbols", async ({}, testInfo) => {
    const receipt = receiptFixture();
    receipt.currency = "INR";
    receipt.restaurantName = "Caf\u00e9 S\u00e3o";
    receipt.customerName = "Jos\u00e9";
    const pdf = await buildOrderReceiptPdf(receipt);
    expect(pdf.toString("latin1")).toContain("/FontFile2");
    fs.writeFileSync(testInfo.outputPath("international-receipt.pdf"), pdf);
  });

  test("includes full VAT invoice details in downloaded PDFs", async ({}, testInfo) => {
    const receipt = receiptFixture();
    Object.assign(receipt, {
      invoiceNumber: 4,
      invoiceIssuedAt: receipt.receiptIssuedAt,
      invoiceTaxPointAt: receipt.receiptIssuedAt,
      invoiceSupplierName: "Cafe Limited",
      invoiceSupplierAddressLine1: "1 High Street",
      invoiceSupplierCity: "London",
      invoiceSupplierPostalCode: "SW1A 1AA",
      invoiceSupplierVatNumber: "GB123456789",
      invoiceCustomerName: "Customer Limited",
      invoiceCustomerAddressLine1: "2 Market Road",
      invoiceCustomerCity: "London",
      invoiceCustomerPostalCode: "SW1A 2AA",
      vatInvoiceType: "FULL",
      taxAmount: "1.25",
      subtotalAmount: "6.25",
    });
    receipt.items[0].taxableAmount = "6.25";
    receipt.items[0].taxAmount = "1.25";
    const pdf = await buildOrderReceiptPdf(receipt);
    expect(pdf.toString("latin1")).toContain("Full VAT invoice INV-000004");
    fs.writeFileSync(testInfo.outputPath("vat-invoice.pdf"), pdf);
  });

  test("calculates line totals with modifier snapshots", () => {
    const receipt = receiptFixture();

    expect(getReceiptItemTotal(receipt.items[0], receipt.currency)).toBe("7.50");
  });

  test("rounds displayed VAT net unit prices without changing stored line totals", () => {
    const item = { ...receiptFixture().items[0], taxableAmount: "6.25" };
    expect(getVatNetUnitPrice(item, "GBP")).toBe("3.13");
    expect(item.taxableAmount).toBe("6.25");
  });

  test("builds escaped receipt email content from financial snapshots", () => {
    const email = buildOrderReceiptEmail(receiptFixture());

    expect(email.subject).toBe("Cafe & Co receipt R-000007");
    expect(email.textBody).toContain("Total: £7.50");
    expect(email.textBody).toContain("Fulfilment: Takeaway");
    expect(email.htmlBody).toContain("Lunch &lt;special&gt;");
    expect(email.htmlBody).not.toContain("Lunch <special>");
  });

  test("uses and escapes the configured receipt footer", () => {
    const receipt = receiptFixture();
    receipt.footerMessage = "Thanks <again> & see you soon";

    const email = buildOrderReceiptEmail(receipt);

    expect(email.textBody).toContain("Thanks <again> & see you soon");
    expect(email.htmlBody).toContain("Thanks &lt;again&gt; &amp; see you soon");
  });

  test("builds a simplified VAT invoice from immutable snapshots", () => {
    const receipt = receiptFixture();
    receipt.invoiceIssuedAt = new Date("2026-07-21T10:01:00.000Z");
    receipt.invoiceNumber = 4;
    receipt.invoiceSupplierAddressLine1 = "1 High Street";
    receipt.invoiceSupplierCity = "London";
    receipt.invoiceSupplierCountryCode = "GB";
    receipt.invoiceSupplierName = "Cafe Limited";
    receipt.invoiceSupplierPostalCode = "SW1A 1AA";
    receipt.invoiceSupplierVatNumber = "GB123456789";
    receipt.invoiceTaxPointAt = new Date("2026-07-21T10:01:00.000Z");
    receipt.taxAmount = "1.25";
    receipt.taxRateBps = 2000;
    receipt.items[0].taxAmount = "1.25";
    receipt.items[0].taxRateBps = 2000;
    receipt.items[0].taxComponents = [
      {
        calculationOrder: 0,
        code: "VAT_STD",
        isCompound: false,
        name: "VAT",
        pricingMode: "INCLUSIVE",
        rateBps: 2000,
        taxableAmount: "6.25",
        taxAmount: "1.25",
        treatment: "TAXABLE",
      },
    ];
    receipt.taxSummary = aggregateReceiptTaxComponents(
      receipt.items,
      receipt.currency,
    );
    receipt.vatInvoiceType = "SIMPLIFIED";

    const email = buildOrderReceiptEmail(receipt);

    expect(email.subject).toBe(
      "Cafe & Co simplified vat invoice INV-000004",
    );
    expect(email.textBody).toContain("VAT registration number: GB123456789");
    expect(email.textBody).toContain("Tax point 21 Jul 2026");
    expect(email.textBody).toContain("Net unit");
    expect(email.textBody).toContain("VAT (20%)");
  });

  test("aggregates named tax components without merging different rates", () => {
    const receipt = receiptFixture();
    receipt.items.push({
      ...receipt.items[0],
      drinkName: "Dinner",
      taxComponents: [
        {
          calculationOrder: 0,
          code: "VAT_STD",
          isCompound: false,
          name: "VAT",
          pricingMode: "EXCLUSIVE",
          rateBps: 2000,
          taxableAmount: "5.00",
          taxAmount: "1.00",
          treatment: "TAXABLE",
        },
        {
          calculationOrder: 1,
          code: "CITY",
          isCompound: false,
          name: "City levy",
          pricingMode: "EXCLUSIVE",
          rateBps: 500,
          taxableAmount: "5.00",
          taxAmount: "0.25",
          treatment: "TAXABLE",
        },
      ],
    });
    receipt.items[0].taxComponents = [
      {
        calculationOrder: 0,
        code: "VAT_STD",
        isCompound: false,
        name: "VAT",
        pricingMode: "EXCLUSIVE",
        rateBps: 2000,
        taxableAmount: "7.50",
        taxAmount: "1.50",
        treatment: "TAXABLE",
      },
    ];

    const summary = aggregateReceiptTaxComponents(
      receipt.items,
      receipt.currency,
    );

    expect(summary).toHaveLength(2);
    expect(summary[0]).toMatchObject({
      code: "VAT_STD",
      taxableAmount: "12.50",
      taxAmount: "2.50",
    });
    expect(summary[1]).toMatchObject({
      code: "CITY",
      taxableAmount: "5.00",
      taxAmount: "0.25",
    });
  });

  test("requires and normalizes customer details for full VAT invoices", () => {
    expect(
      vatInvoiceRequestSchema.safeParse({ type: "FULL" }).success,
    ).toBe(false);

    const result = vatInvoiceRequestSchema.safeParse({
      customer: {
        addressLine1: " 1 High Street ",
        addressLine2: "",
        city: " London ",
        countryCode: "gb",
        name: " Example Limited ",
        postalCode: " SW1A 1AA ",
        region: "",
      },
      type: "FULL",
    });

    expect(result.success).toBe(true);
    if (result.success && result.data.type === "FULL") {
      expect(result.data.customer).toEqual({
        addressLine1: "1 High Street",
        addressLine2: null,
        city: "London",
        countryCode: "GB",
        name: "Example Limited",
        postalCode: "SW1A 1AA",
        region: null,
      });
    }
  });

  test("scopes staff and customer receipt reads", () => {
    const loader = source("lib/order-receipts.ts");
    const staffPage = source(
      "app/restaurants/[restaurantSlug]/orders/[orderId]/receipt/page.tsx",
    );
    const customerPage = source("app/order/receipt/[orderId]/page.tsx");
    const customerAccess = source("lib/customer-receipts.ts");
    const downloadRoute = source("app/order/receipt/[orderId]/pdf/route.ts");

    expect(loader).toContain("eq(orders.organizationId, context.organizationId)");
    expect(loader).toContain("eq(orders.organizationCustomerId, organizationCustomerId)");
    expect(loader).toContain("orderItemTaxComponents.taxCodeSnapshot");
    expect(loader).toContain("aggregateReceiptTaxComponents");
    expect(staffPage).toContain("requireRestaurantWorkspaceAccess");
    expect(customerPage).toContain("getCustomerReceipt");
    expect(downloadRoute).toContain("getCustomerReceipt");
    expect(customerAccess).toContain("requireCustomerSession");
    expect(customerAccess).toContain("profile?.id");
    expect(customerAccess).toContain("guestOrder?.orderId === orderId");
  });

  test("keeps customer receipt downloads separate from staff printing", () => {
    const receiptPage = source("components/receipt/ReceiptPage.tsx");
    const customerPage = source("app/order/receipt/[orderId]/page.tsx");
    const customerHistory = source("components/order/CustomerOrderStatus.tsx");

    expect(receiptPage).toContain('tone === "customer" ? (');
    expect(receiptPage).toContain("<DownloadReceiptButton receiptHref={receiptHref} />");
    expect(receiptPage).toContain("<PrintReceiptButton autoPrint={autoPrint} />");
    expect(customerPage).not.toContain("autoPrint=");
    expect(customerPage).toContain('receiptUrl.searchParams.set("session_id", query.session_id)');
    expect(customerHistory).toContain("<DownloadReceiptButton receiptHref={receiptHref} />");
  });

  test("emails only the linked verified customer through tenant delivery", () => {
    const loader = source("lib/order-receipts.ts");
    const sender = source("lib/order-receipt-email.ts");
    const route = source("app/api/orders/[id]/receipt/email/route.ts");

    expect(loader).toContain("customers.emailVerifiedAt");
    expect(loader).toContain("record.customerEmailVerifiedAt");
    expect(sender).toContain("resolveOrganizationEmailIntegration");
    expect(sender).toContain("to: receipt.customerEmail");
    expect(route).toContain('action: "order.receipt.email"');
    expect(route).not.toContain("request.json");
  });

  test("exports issued receipt tax components in operational reports", () => {
    const reports = source("lib/saas-reports.ts");

    expect(reports).toContain('csvRow(["Issued receipt tax breakdown"])');
    expect(reports).toContain("isNotNull(orders.receiptIssuedAt)");
    expect(reports).toContain("orderItemTaxComponents.taxNameSnapshot");
  });
});
