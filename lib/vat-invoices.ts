import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { getDb } from "@/db";
import { orders, organizationTaxProfiles } from "@/db/schema";
import { decimalToMinorUnits } from "@/lib/currency-money";
import { getNextInvoiceNumber } from "@/lib/financial-document-numbers";
import {
  vatInvoiceRequestSchema,
  type VatInvoiceRequest,
} from "@/lib/validations/vat-invoice";

const simplifiedVatInvoiceLimitMinor = 25_000;
const invoiceEligiblePaymentStatuses = new Set([
  "PAID",
  "REFUND_PENDING",
  "PARTIALLY_REFUNDED",
  "REFUND_FAILED",
  "REFUNDED",
]);

export class VatInvoiceError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
    this.name = "VatInvoiceError";
  }
}

function assertRegisteredUkVatProfile(
  profile: typeof organizationTaxProfiles.$inferSelect | undefined,
) {
  if (
    !profile ||
    profile.taxSystem !== "VAT" ||
    profile.registrationStatus !== "REGISTERED" ||
    profile.countryCode !== "GB" ||
    !profile.registrationNumber ||
    !profile.legalName ||
    !profile.addressLine1 ||
    !profile.city ||
    !profile.postalCode
  ) {
    throw new VatInvoiceError(
      "Complete the restaurant's UK VAT registration profile before issuing VAT invoices.",
    );
  }

  return profile;
}

export async function issueVatInvoice(
  orderId: string,
  organizationId: string,
  input: VatInvoiceRequest,
) {
  const request = vatInvoiceRequestSchema.parse(input);

  return getDb().transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.id, orderId),
          eq(orders.organizationId, organizationId),
        ),
      )
      .limit(1)
      .for("update");

    if (!order) {
      throw new VatInvoiceError("Order not found.", 404);
    }

    if (order.invoiceNumber) {
      throw new VatInvoiceError("A VAT invoice has already been issued.", 409);
    }

    if (
      !invoiceEligiblePaymentStatuses.has(order.paymentStatus) ||
      !order.receiptNumber ||
      !order.receiptIssuedAt ||
      !order.finalTotalAmountSnapshot ||
      !order.financialSnapshotCurrency
    ) {
      throw new VatInvoiceError(
        "The bill must be fully paid before issuing a VAT invoice.",
      );
    }

    if (
      order.financialSnapshotCurrency !== "GBP" ||
      order.taxRateBpsSnapshot <= 0
    ) {
      throw new VatInvoiceError(
        "UK VAT invoices require a GBP bill with a taxable supply.",
      );
    }

    const [taxProfileRecord] = await tx
      .select()
      .from(organizationTaxProfiles)
      .where(eq(organizationTaxProfiles.organizationId, organizationId))
      .limit(1);
    const taxProfile = assertRegisteredUkVatProfile(taxProfileRecord);
    const totalMinor = decimalToMinorUnits(
      order.finalTotalAmountSnapshot,
      order.financialSnapshotCurrency,
    );

    if (
      request.type === "SIMPLIFIED" &&
      totalMinor > simplifiedVatInvoiceLimitMinor
    ) {
      throw new VatInvoiceError(
        "Orders above GBP 250 require a full VAT invoice.",
      );
    }

    const now = new Date();
    const invoiceNumber = await getNextInvoiceNumber(tx, organizationId);
    const [updatedOrder] = await tx
      .update(orders)
      .set({
        invoiceCustomerAddressLine1:
          request.type === "FULL" ? request.customer.addressLine1 : null,
        invoiceCustomerAddressLine2:
          request.type === "FULL" ? request.customer.addressLine2 : null,
        invoiceCustomerCity:
          request.type === "FULL" ? request.customer.city : null,
        invoiceCustomerCountryCode:
          request.type === "FULL" ? request.customer.countryCode : null,
        invoiceCustomerName:
          request.type === "FULL" ? request.customer.name : null,
        invoiceCustomerPostalCode:
          request.type === "FULL" ? request.customer.postalCode : null,
        invoiceCustomerRegion:
          request.type === "FULL" ? request.customer.region : null,
        invoiceIssuedAt: now,
        invoiceNumber,
        invoiceSupplierAddressLine1: taxProfile.addressLine1,
        invoiceSupplierAddressLine2: taxProfile.addressLine2,
        invoiceSupplierCity: taxProfile.city,
        invoiceSupplierCountryCode: taxProfile.countryCode,
        invoiceSupplierName: taxProfile.legalName,
        invoiceSupplierPostalCode: taxProfile.postalCode,
        invoiceSupplierRegion: taxProfile.region,
        invoiceSupplierVatNumber: taxProfile.registrationNumber,
        invoiceTaxPointAt: order.paidAt ?? order.receiptIssuedAt,
        updatedAt: now,
        vatInvoiceType: request.type,
      })
      .where(
        and(
          eq(orders.id, order.id),
          eq(orders.organizationId, organizationId),
          isNull(orders.invoiceNumber),
        ),
      )
      .returning({
        invoiceNumber: orders.invoiceNumber,
        type: orders.vatInvoiceType,
      });

    if (!updatedOrder?.invoiceNumber || !updatedOrder.type) {
      throw new VatInvoiceError(
        "The invoice changed while it was being issued. Refresh and try again.",
        409,
      );
    }

    return updatedOrder;
  });
}
