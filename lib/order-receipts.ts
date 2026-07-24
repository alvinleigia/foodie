import "server-only";

import { and, asc, eq } from "drizzle-orm";

import { getDb } from "@/db";
import {
  customers,
  orderItemTaxComponents,
  orderPayments,
  orders,
  organizationCustomers,
  organizationTaxProfiles,
  organizations,
} from "@/db/schema";
import {
  aggregateReceiptTaxComponents,
  type OrderReceipt,
  type OrderReceiptTaxComponent,
} from "@/lib/order-receipt-format";
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
      fulfilmentType: orders.fulfilmentType,
      requestedFulfilmentAt: orders.requestedFulfilmentAt,
      promisedFulfilmentAt: orders.promisedFulfilmentAt,
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
      taxPricingMode: orders.taxPricingModeSnapshot,
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

  const [items, payments, taxComponentRows] = await Promise.all([
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
    getDb()
      .select({
        calculationOrder: orderItemTaxComponents.calculationOrderSnapshot,
        code: orderItemTaxComponents.taxCodeSnapshot,
        isCompound: orderItemTaxComponents.isCompoundSnapshot,
        name: orderItemTaxComponents.taxNameSnapshot,
        orderItemId: orderItemTaxComponents.orderItemId,
        pricingMode: orderItemTaxComponents.pricingModeSnapshot,
        rateBps: orderItemTaxComponents.rateBpsSnapshot,
        taxableAmount: orderItemTaxComponents.taxableAmountSnapshot,
        taxAmount: orderItemTaxComponents.taxAmountSnapshot,
        treatment: orderItemTaxComponents.treatmentSnapshot,
      })
      .from(orderItemTaxComponents)
      .where(
        and(
          eq(orderItemTaxComponents.orderId, orderId),
          eq(
            orderItemTaxComponents.organizationId,
            context.organizationId,
          ),
        ),
      )
      .orderBy(
        asc(orderItemTaxComponents.calculationOrderSnapshot),
        asc(orderItemTaxComponents.taxCodeSnapshot),
      ),
  ]);
  const taxComponentsByItemId = new Map<
    string,
    OrderReceiptTaxComponent[]
  >();

  for (const component of taxComponentRows) {
    const components = taxComponentsByItemId.get(component.orderItemId) ?? [];
    components.push({
      calculationOrder: component.calculationOrder,
      code: component.code,
      isCompound: component.isCompound,
      name: component.name,
      pricingMode: component.pricingMode,
      rateBps: component.rateBps,
      taxableAmount: component.taxableAmount,
      taxAmount: component.taxAmount,
      treatment: component.treatment,
    });
    taxComponentsByItemId.set(component.orderItemId, components);
  }

  const receiptItems = items.map((item) => {
    let taxComponents = item.id
      ? (taxComponentsByItemId.get(item.id) ?? [])
      : [];

    if (
      taxComponents.length === 0 &&
      item.taxableAmountSnapshot !== null &&
      item.taxAmountSnapshot !== null &&
      (record.vatTaxSystem === "VAT" ||
        item.taxRateBpsSnapshot > 0 ||
        Number(item.taxAmountSnapshot) > 0)
    ) {
      taxComponents = [
        {
          calculationOrder: 0,
          code: record.vatTaxSystem === "VAT" ? "DEFAULT" : "LEGACY",
          isCompound: false,
          name: record.vatTaxSystem === "VAT" ? "VAT" : "Legacy tax",
          pricingMode: record.taxPricingMode,
          rateBps: item.taxRateBpsSnapshot,
          taxableAmount: item.taxableAmountSnapshot,
          taxAmount: item.taxAmountSnapshot,
          treatment:
            item.taxRateBpsSnapshot === 0 ? "ZERO_RATED" : "TAXABLE",
        },
      ];
    }

    return {
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
      taxComponents,
      unitPrice: item.unitPrice,
    };
  });
  const taxSummary = aggregateReceiptTaxComponents(
    receiptItems,
    record.currency,
  );
  const hasVatSupply = taxSummary.some(
    (component) =>
      component.treatment === "TAXABLE" ||
      component.treatment === "ZERO_RATED",
  );

  return {
    ...record,
    canIssueSimplifiedVatInvoice:
      !record.invoiceNumber &&
      record.vatTaxSystem === "VAT" &&
      record.vatRegistrationStatus === "REGISTERED" &&
      record.vatRegistrationCountryCode === "GB" &&
      Boolean(record.vatRegistrationNumber) &&
      record.currency === "GBP" &&
      hasVatSupply &&
      Number(record.finalTotalAmount) <= 250,
    canIssueVatInvoice:
      !record.invoiceNumber &&
      record.vatTaxSystem === "VAT" &&
      record.vatRegistrationStatus === "REGISTERED" &&
      record.vatRegistrationCountryCode === "GB" &&
      Boolean(record.vatRegistrationNumber) &&
      record.currency === "GBP" &&
      hasVatSupply,
    cancellationFeeAmount: record.cancellationFeeAmount ?? null,
    chargeAmount: record.chargeAmount,
    currency: record.currency,
    customerEmail: record.customerEmailVerifiedAt
      ? record.customerEmail
      : null,
    discountAmount: record.discountAmount,
    finalTotalAmount: record.finalTotalAmount,
    items: receiptItems,
    payments,
    receiptIssuedAt: record.receiptIssuedAt,
    receiptNumber: record.receiptNumber,
    refundAmount: record.refundAmount ?? null,
    subtotalAmount: record.subtotalAmount,
    taxAmount: record.taxAmount,
    taxSummary,
    tipAmount: record.tipAmount,
  };
}
