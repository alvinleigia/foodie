import {
  decimalToMinorUnits,
  minorUnitsToDecimal,
} from "@/lib/currency-money";
import { formatFinancialDocumentNumber } from "@/lib/financial-document-numbers";
import {
  getOrderFulfilmentLabel,
  type OrderFulfilmentType,
} from "@/lib/order-fulfilment";
import {
  formatOrderFulfilmentTime,
  getEffectiveFulfilmentTime,
} from "@/lib/order-fulfilment-time";

export type OrderReceiptItem = {
  drinkName: string;
  quantity: number;
  taxableAmount: string | null;
  taxAmount: string | null;
  taxRateBps: number;
  unitPrice: string | null;
  modifiers: Array<{
    modifierName: string;
    priceDelta: string;
    quantity: number;
  }>;
};

export type OrderReceiptPayment = {
  amount: string;
  changeAmount: string | null;
  method: "CASH" | "STRIPE_CHECKOUT";
  tenderedAmount: string | null;
};

export type OrderReceipt = {
  canIssueSimplifiedVatInvoice: boolean;
  canIssueVatInvoice: boolean;
  cancellationFeeAmount: string | null;
  chargeAmount: string;
  createdAt: Date;
  currency: string;
  customerEmail: string | null;
  customerName: string;
  discountAmount: string;
  finalTotalAmount: string;
  fulfilmentType: OrderFulfilmentType;
  requestedFulfilmentAt: Date | null;
  promisedFulfilmentAt: Date | null;
  invoiceCustomerAddressLine1: string | null;
  invoiceCustomerAddressLine2: string | null;
  invoiceCustomerCity: string | null;
  invoiceCustomerCountryCode: string | null;
  invoiceCustomerName: string | null;
  invoiceCustomerPostalCode: string | null;
  invoiceCustomerRegion: string | null;
  invoiceIssuedAt: Date | null;
  invoiceNumber: number | null;
  invoiceSupplierAddressLine1: string | null;
  invoiceSupplierAddressLine2: string | null;
  invoiceSupplierCity: string | null;
  invoiceSupplierCountryCode: string | null;
  invoiceSupplierName: string | null;
  invoiceSupplierPostalCode: string | null;
  invoiceSupplierRegion: string | null;
  invoiceSupplierVatNumber: string | null;
  invoiceTaxPointAt: Date | null;
  items: OrderReceiptItem[];
  orderDate: string;
  orderId: string;
  orderNo: number;
  payments: OrderReceiptPayment[];
  paymentStatus: string;
  receiptIssuedAt: Date;
  receiptNumber: number;
  refundAmount: string | null;
  restaurantName: string;
  restaurantSlug: string;
  subtotalAmount: string;
  taxAmount: string;
  taxRateBps: number;
  tipAmount: string;
  timezone: string;
  vatInvoiceType: "SIMPLIFIED" | "FULL" | null;
};

export function formatVatRate(taxRateBps: number) {
  return `${(taxRateBps / 100).toFixed(2).replace(/\.00$/, "")}%`;
}

export function getInvoiceAddressLines(receipt: OrderReceipt) {
  const supplier = [
    receipt.invoiceSupplierAddressLine1,
    receipt.invoiceSupplierAddressLine2,
    receipt.invoiceSupplierCity,
    receipt.invoiceSupplierRegion,
    receipt.invoiceSupplierPostalCode,
    receipt.invoiceSupplierCountryCode,
  ].filter((value): value is string => Boolean(value));
  const customer = [
    receipt.invoiceCustomerAddressLine1,
    receipt.invoiceCustomerAddressLine2,
    receipt.invoiceCustomerCity,
    receipt.invoiceCustomerRegion,
    receipt.invoiceCustomerPostalCode,
    receipt.invoiceCustomerCountryCode,
  ].filter((value): value is string => Boolean(value));

  return { customer, supplier };
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function formatReceiptMoney(amount: string, currency: string) {
  return new Intl.NumberFormat("en-GB", {
    currency,
    style: "currency",
  }).format(Number(amount));
}

export function getReceiptItemTotal(
  item: OrderReceiptItem,
  currency: string,
) {
  if (item.unitPrice === null) {
    return null;
  }

  const modifierAmountMinor = item.modifiers.reduce(
    (total, modifier) =>
      total +
      decimalToMinorUnits(modifier.priceDelta, currency) * modifier.quantity,
    0,
  );
  const unitAmountMinor =
    decimalToMinorUnits(item.unitPrice, currency) + modifierAmountMinor;

  return minorUnitsToDecimal(unitAmountMinor * item.quantity, currency);
}

export function getVatNetUnitPrice(
  item: OrderReceiptItem,
  currency: string,
) {
  if (item.taxableAmount === null || item.quantity <= 0) {
    return null;
  }

  const taxableAmountMinor = decimalToMinorUnits(
    item.taxableAmount,
    currency,
  );

  return minorUnitsToDecimal(taxableAmountMinor / item.quantity, currency);
}

export function buildOrderReceiptEmail(receipt: OrderReceipt) {
  const receiptReference = formatFinancialDocumentNumber(
    "RECEIPT",
    receipt.receiptNumber,
  );
  const hasVatInvoice = Boolean(
    receipt.vatInvoiceType &&
      receipt.invoiceNumber &&
      receipt.invoiceIssuedAt &&
      receipt.invoiceTaxPointAt &&
      receipt.invoiceSupplierName &&
      receipt.invoiceSupplierVatNumber,
  );
  const invoiceReference = hasVatInvoice
    ? formatFinancialDocumentNumber("INVOICE", receipt.invoiceNumber!)
    : null;
  const documentLabel = hasVatInvoice
    ? `${receipt.vatInvoiceType === "FULL" ? "Full" : "Simplified"} VAT invoice`
    : "Receipt";
  const documentReference = invoiceReference ?? receiptReference;
  const issuedAt = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: receipt.timezone,
  }).format(receipt.invoiceIssuedAt ?? receipt.receiptIssuedAt);
  const taxPointAt = receipt.invoiceTaxPointAt
    ? new Intl.DateTimeFormat("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: receipt.timezone,
      }).format(receipt.invoiceTaxPointAt)
    : null;
  const { customer: customerAddress, supplier: supplierAddress } =
    getInvoiceAddressLines(receipt);
  const fulfilmentLabel = getOrderFulfilmentLabel(receipt.fulfilmentType);
  const fulfilmentTime = getEffectiveFulfilmentTime(receipt);
  const fulfilmentTimeLine = fulfilmentTime
    ? `${fulfilmentTime.label}: ${formatOrderFulfilmentTime(fulfilmentTime.at, {
        timeZone: receipt.timezone,
      })}`
    : "Timing: As soon as possible";
  const itemLines = receipt.items.map((item) => {
    const total = getReceiptItemTotal(item, receipt.currency);
    const netUnitPrice = getVatNetUnitPrice(item, receipt.currency);
    const modifiers = item.modifiers
      .map(
        (modifier) =>
          `${modifier.modifierName}${modifier.quantity > 1 ? ` x${modifier.quantity}` : ""}`,
      )
      .join(", ");
    const vatDetails =
      hasVatInvoice &&
      netUnitPrice !== null &&
      item.taxableAmount !== null &&
      item.taxAmount !== null
        ? `Net unit ${formatReceiptMoney(netUnitPrice, receipt.currency)}, net line ${formatReceiptMoney(item.taxableAmount, receipt.currency)}, VAT ${formatVatRate(item.taxRateBps)} ${formatReceiptMoney(item.taxAmount, receipt.currency)}`
        : null;

    return {
      html: `<tr><td style="padding:8px 0;border-bottom:1px solid #e7e5e4"><strong>${escapeHtml(item.drinkName)}</strong>${modifiers ? `<br><span style="color:#78716c">${escapeHtml(modifiers)}</span>` : ""}${vatDetails ? `<br><span style="color:#78716c">${escapeHtml(vatDetails)}</span>` : ""}</td><td style="padding:8px 12px;border-bottom:1px solid #e7e5e4;text-align:center">${item.quantity}</td><td style="padding:8px 0;border-bottom:1px solid #e7e5e4;text-align:right">${total ? escapeHtml(formatReceiptMoney(total, receipt.currency)) : "-"}</td></tr>`,
      text: `${item.drinkName} x${item.quantity}${modifiers ? ` (${modifiers})` : ""}: ${total ? formatReceiptMoney(total, receipt.currency) : "-"}${vatDetails ? `; ${vatDetails}` : ""}`,
    };
  });
  const summaryRows = [
    [hasVatInvoice ? "Net total" : "Subtotal", receipt.subtotalAmount],
    ...(Number(receipt.discountAmount) > 0
      ? [["Discount", `-${receipt.discountAmount}`]]
      : []),
    ...(Number(receipt.taxAmount) > 0
      ? [[hasVatInvoice ? "VAT total" : "Tax", receipt.taxAmount]]
      : []),
    ...(Number(receipt.chargeAmount) > 0
      ? [["Charges", receipt.chargeAmount]]
      : []),
    ...(Number(receipt.tipAmount) > 0 ? [["Tip", receipt.tipAmount]] : []),
  ];

  return {
    subject: `${receipt.restaurantName} ${documentLabel.toLowerCase()} ${documentReference}`,
    textBody: [
      receipt.invoiceSupplierName ?? receipt.restaurantName,
      `${documentLabel} ${documentReference}`,
      ...(hasVatInvoice
        ? [
            ...supplierAddress,
            `VAT registration number: ${receipt.invoiceSupplierVatNumber}`,
          ]
        : []),
      `Order #${receipt.orderNo}`,
      `Fulfilment: ${fulfilmentLabel}`,
      fulfilmentTimeLine,
      `Issued ${issuedAt}`,
      ...(taxPointAt ? [`Tax point ${taxPointAt}`] : []),
      ...(receipt.vatInvoiceType === "FULL" && receipt.invoiceCustomerName
        ? [
            "",
            `Customer: ${receipt.invoiceCustomerName}`,
            ...customerAddress,
          ]
        : []),
      "",
      ...itemLines.map((line) => line.text),
      "",
      ...summaryRows.map(
        ([label, amount]) =>
          `${label}: ${formatReceiptMoney(amount, receipt.currency)}`,
      ),
      `Total: ${formatReceiptMoney(receipt.finalTotalAmount, receipt.currency)}`,
      ...(receipt.refundAmount
        ? [`Refunded: ${formatReceiptMoney(receipt.refundAmount, receipt.currency)}`]
        : []),
      "",
      "Thank you for your order.",
    ].join("\n"),
    htmlBody: `<div style="max-width:600px;margin:0 auto;font-family:Arial,sans-serif;color:#1c1917"><h1 style="font-size:24px;margin-bottom:4px">${escapeHtml(receipt.invoiceSupplierName ?? receipt.restaurantName)}</h1><p style="margin-top:0;color:#78716c">${escapeHtml(documentLabel)} ${escapeHtml(documentReference)} &middot; Order #${receipt.orderNo}<br>Fulfilment: ${escapeHtml(fulfilmentLabel)}<br>${escapeHtml(fulfilmentTimeLine)}<br>Issued ${escapeHtml(issuedAt)}${taxPointAt ? `<br>Tax point ${escapeHtml(taxPointAt)}` : ""}</p>${hasVatInvoice ? `<p style="color:#57534e">${supplierAddress.map(escapeHtml).join("<br>")}<br>VAT registration number: ${escapeHtml(receipt.invoiceSupplierVatNumber!)}</p>` : ""}${receipt.vatInvoiceType === "FULL" && receipt.invoiceCustomerName ? `<div style="margin-top:20px"><strong>Customer</strong><br>${escapeHtml(receipt.invoiceCustomerName)}<br>${customerAddress.map(escapeHtml).join("<br>")}</div>` : ""}<table style="width:100%;border-collapse:collapse;margin:24px 0"><thead><tr><th style="padding:8px 0;text-align:left;border-bottom:2px solid #1c1917">Item</th><th style="padding:8px 12px;text-align:center;border-bottom:2px solid #1c1917">Qty</th><th style="padding:8px 0;text-align:right;border-bottom:2px solid #1c1917">Amount</th></tr></thead><tbody>${itemLines.map((line) => line.html).join("")}</tbody></table><table style="width:100%;border-collapse:collapse">${summaryRows.map(([label, amount]) => `<tr><td style="padding:4px 0;color:#57534e">${escapeHtml(label)}</td><td style="padding:4px 0;text-align:right">${escapeHtml(formatReceiptMoney(amount, receipt.currency))}</td></tr>`).join("")}<tr><td style="padding:12px 0 4px;border-top:2px solid #1c1917;font-size:18px;font-weight:bold">Total</td><td style="padding:12px 0 4px;border-top:2px solid #1c1917;text-align:right;font-size:18px;font-weight:bold">${escapeHtml(formatReceiptMoney(receipt.finalTotalAmount, receipt.currency))}</td></tr>${receipt.refundAmount ? `<tr><td style="padding:4px 0;color:#57534e">Refunded</td><td style="padding:4px 0;text-align:right">${escapeHtml(formatReceiptMoney(receipt.refundAmount, receipt.currency))}</td></tr>` : ""}</table><p style="margin-top:28px;color:#57534e">Thank you for your order.</p></div>`,
  };
}
