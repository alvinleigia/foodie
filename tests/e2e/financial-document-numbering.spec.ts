import fs from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { formatFinancialDocumentNumber } from "@/lib/financial-document-numbers";

const root = process.cwd();

function source(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test.describe("restaurant financial document numbering", () => {
  test("formats stable receipt and invoice references", () => {
    expect(formatFinancialDocumentNumber("RECEIPT", 42)).toBe("R-000042");
    expect(formatFinancialDocumentNumber("INVOICE", 42)).toBe("INV-000042");
  });

  test("allocates numbers atomically from restaurant-scoped counters", () => {
    const helper = source("lib/financial-document-numbers.ts");

    expect(helper).toContain("onConflictDoUpdate");
    expect(helper).toContain("restaurantDocumentCounters.organizationId");
    expect(helper).toContain("restaurantDocumentCounters.documentType");
    expect(helper).toContain("restaurantDocumentCounters.lastNumber} + 1");
  });

  test("issues receipts only when cash or Stripe completes the bill", () => {
    for (const file of [
      "lib/order-payments.ts",
      "lib/staff-order-payments.ts",
    ]) {
      const paymentSource = source(file);

      expect(paymentSource).toContain("getFinancialDocumentNumberUpdate");
      expect(paymentSource).toContain("isPaid");
      expect(paymentSource).toContain("...financialDocumentUpdate");
    }
  });

  test("issues VAT invoices separately from paid receipts", () => {
    const service = source("lib/vat-invoices.ts");
    const route = source("app/api/orders/[id]/vat-invoice/route.ts");

    expect(service).toContain("getNextInvoiceNumber");
    expect(service).toContain("simplifiedVatInvoiceLimitMinor");
    expect(service).toContain('profile.registrationStatus !== "REGISTERED"');
    expect(route).toContain("issueVatInvoice");
    expect(route).toContain('action: "order.vat_invoice.issue"');
  });

  test("protects issued numbers with database constraints and immutability", () => {
    const migration = source(
      "drizzle/0045_restaurant_financial_document_numbers.sql",
    );

    expect(migration).toContain("orders_restaurant_receipt_number_unique");
    expect(migration).toContain("orders_restaurant_invoice_number_unique");
    expect(migration).toContain("prevent_issued_financial_document_update");
    expect(migration).toContain("Issued receipt numbers cannot be changed.");
    expect(migration).toContain("Issued invoice numbers cannot be changed.");
  });

  test("freezes UK VAT invoice identity and enforces full customer data", () => {
    const migration = source("drizzle/0046_uk_vat_invoices.sql");

    expect(migration).toContain('CREATE TYPE "vat_invoice_type"');
    expect(migration).toContain('"invoice_supplier_vat_number"');
    expect(migration).toContain('"invoice_customer_address_line_1"');
    expect(migration).toContain("Issued VAT invoices cannot be changed.");
  });
});
