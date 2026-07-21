import "server-only";

import { and, asc, eq } from "drizzle-orm";

import { getDb } from "@/db";
import {
  customers,
  orderPayments,
  orders,
  organizationCustomers,
  organizationTaxProfiles,
  organizations,
} from "@/db/schema";
import type { OrderReceipt } from "@/lib/order-receipt-format";
import { getOrderItems } from "@/lib/orders";
import type { TenantContext } from "@/lib/tenant-context";

export async function getOrderReceipt(
  orderId: string,
  context: TenantContext,
  organizationCustomerId?: string,
): Promise<OrderReceipt | null> {
  const filters = [
    eq(orders.id, orderId),
    eq(orders.organizationId, context.organizationId),
  ];

  if (organizationCustomerId) {
    filters.push(eq(orders.organizationCustomerId, organizationCustomerId));
  }

  const [record] = await getDb()
    .select({
      cancellationFeeAmount: orders.cancellationFeeAmount,
      chargeAmount: orders.chargeAmountSnapshot,
      createdAt: orders.createdAt,
      currency: orders.financialSnapshotCurrency,
      customerEmail: customers.email,
      customerEmailVerifiedAt: customers.emailVerifiedAt,
      customerName: orders.customerName,
      discountAmount: orders.discountAmountSnapshot,
      finalTotalAmount: orders.finalTotalAmountSnapshot,
      invoiceCustomerAddressLine1: orders.invoiceCustomerAddressLine1,
      invoiceCustomerAddressLine2: orders.invoiceCustomerAddressLine2,
      invoiceCustomerCity: orders.invoiceCustomerCity,
      invoiceCustomerCountryCode: orders.invoiceCustomerCountryCode,
      invoiceCustomerName: orders.invoiceCustomerName,
      invoiceCustomerPostalCode: orders.invoiceCustomerPostalCode,
      invoiceCustomerRegion: orders.invoiceCustomerRegion,
      invoiceIssuedAt: orders.invoiceIssuedAt,
      invoiceNumber: orders.invoiceNumber,
      invoiceSupplierAddressLine1: orders.invoiceSupplierAddressLine1,
      invoiceSupplierAddressLine2: orders.invoiceSupplierAddressLine2,
      invoiceSupplierCity: orders.invoiceSupplierCity,
      invoiceSupplierCountryCode: orders.invoiceSupplierCountryCode,
      invoiceSupplierName: orders.invoiceSupplierName,
      invoiceSupplierPostalCode: orders.invoiceSupplierPostalCode,
      invoiceSupplierRegion: orders.invoiceSupplierRegion,
      invoiceSupplierVatNumber: orders.invoiceSupplierVatNumber,
      invoiceTaxPointAt: orders.invoiceTaxPointAt,
      orderDate: orders.orderDate,
      orderId: orders.id,
      orderNo: orders.orderNo,
      paymentStatus: orders.paymentStatus,
      receiptIssuedAt: orders.receiptIssuedAt,
      receiptNumber: orders.receiptNumber,
      refundAmount: orders.refundAmount,
      restaurantName: organizations.name,
      restaurantSlug: organizations.slug,
      subtotalAmount: orders.subtotalAmountSnapshot,
      taxAmount: orders.taxAmountSnapshot,
      taxRateBps: orders.taxRateBpsSnapshot,
      timezone: organizations.timezone,
      tipAmount: orders.tipAmountSnapshot,
      vatInvoiceType: orders.vatInvoiceType,
      vatRegistrationCountryCode: organizationTaxProfiles.countryCode,
      vatRegistrationNumber: organizationTaxProfiles.registrationNumber,
      vatRegistrationStatus: organizationTaxProfiles.registrationStatus,
      vatTaxSystem: organizationTaxProfiles.taxSystem,
    })
    .from(orders)
    .innerJoin(organizations, eq(organizations.id, orders.organizationId))
    .leftJoin(
      organizationTaxProfiles,
      eq(organizationTaxProfiles.organizationId, orders.organizationId),
    )
    .leftJoin(
      organizationCustomers,
      eq(organizationCustomers.id, orders.organizationCustomerId),
    )
    .leftJoin(customers, eq(customers.id, organizationCustomers.customerId))
    .where(and(...filters))
    .limit(1);

  if (
    !record?.receiptNumber ||
    !record.receiptIssuedAt ||
    !record.currency ||
    record.subtotalAmount === null ||
    record.discountAmount === null ||
    record.taxAmount === null ||
    record.chargeAmount === null ||
    record.tipAmount === null ||
    record.finalTotalAmount === null
  ) {
    return null;
  }

  const [items, payments] = await Promise.all([
    getOrderItems(orderId, context),
    getDb()
      .select({
        amount: orderPayments.amount,
        changeAmount: orderPayments.changeAmount,
        method: orderPayments.method,
        tenderedAmount: orderPayments.tenderedAmount,
      })
      .from(orderPayments)
      .where(
        and(
          eq(orderPayments.orderId, orderId),
          eq(orderPayments.organizationId, context.organizationId),
          eq(orderPayments.status, "SUCCEEDED"),
        ),
      )
      .orderBy(asc(orderPayments.completedAt), asc(orderPayments.createdAt)),
  ]);

  return {
    ...record,
    canIssueSimplifiedVatInvoice:
      !record.invoiceNumber &&
      record.vatTaxSystem === "VAT" &&
      record.vatRegistrationStatus === "REGISTERED" &&
      record.vatRegistrationCountryCode === "GB" &&
      Boolean(record.vatRegistrationNumber) &&
      record.currency === "GBP" &&
      record.taxRateBps > 0 &&
      Number(record.finalTotalAmount) <= 250,
    canIssueVatInvoice:
      !record.invoiceNumber &&
      record.vatTaxSystem === "VAT" &&
      record.vatRegistrationStatus === "REGISTERED" &&
      record.vatRegistrationCountryCode === "GB" &&
      Boolean(record.vatRegistrationNumber) &&
      record.currency === "GBP" &&
      record.taxRateBps > 0,
    cancellationFeeAmount: record.cancellationFeeAmount ?? null,
    chargeAmount: record.chargeAmount,
    currency: record.currency,
    customerEmail: record.customerEmailVerifiedAt
      ? record.customerEmail
      : null,
    discountAmount: record.discountAmount,
    finalTotalAmount: record.finalTotalAmount,
    items: items.map((item) => ({
      drinkName: item.drinkName,
      modifiers: (item.modifiers ?? []).map((modifier) => ({
        modifierName: modifier.modifierName,
        priceDelta: modifier.priceDelta,
        quantity: modifier.quantity,
      })),
      quantity: item.quantity,
      taxableAmount: item.taxableAmountSnapshot,
      taxAmount: item.taxAmountSnapshot,
      taxRateBps: item.taxRateBpsSnapshot,
      unitPrice: item.unitPrice,
    })),
    payments,
    receiptIssuedAt: record.receiptIssuedAt,
    receiptNumber: record.receiptNumber,
    refundAmount: record.refundAmount ?? null,
    subtotalAmount: record.subtotalAmount,
    taxAmount: record.taxAmount,
    tipAmount: record.tipAmount,
  };
}
