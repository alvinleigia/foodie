import {
  decimalToMinorUnits,
  minorUnitsToDecimal,
} from "@/lib/currency-money";
import { formatFinancialDocumentNumber } from "@/lib/financial-document-numbers";

export type OrderReceiptItem = {
  drinkName: string;
  quantity: number;
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
  cancellationFeeAmount: string | null;
  chargeAmount: string;
  createdAt: Date;
  currency: string;
  customerEmail: string | null;
  customerName: string;
  discountAmount: string;
  finalTotalAmount: string;
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
  tipAmount: string;
  timezone: string;
};

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

export function buildOrderReceiptEmail(receipt: OrderReceipt) {
  const receiptReference = formatFinancialDocumentNumber(
    "RECEIPT",
    receipt.receiptNumber,
  );
  const issuedAt = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: receipt.timezone,
  }).format(receipt.receiptIssuedAt);
  const itemLines = receipt.items.map((item) => {
    const total = getReceiptItemTotal(item, receipt.currency);
    const modifiers = item.modifiers
      .map(
        (modifier) =>
          `${modifier.modifierName}${modifier.quantity > 1 ? ` x${modifier.quantity}` : ""}`,
      )
      .join(", ");

    return {
      html: `<tr><td style="padding:8px 0;border-bottom:1px solid #e7e5e4"><strong>${escapeHtml(item.drinkName)}</strong>${modifiers ? `<br><span style="color:#78716c">${escapeHtml(modifiers)}</span>` : ""}</td><td style="padding:8px 12px;border-bottom:1px solid #e7e5e4;text-align:center">${item.quantity}</td><td style="padding:8px 0;border-bottom:1px solid #e7e5e4;text-align:right">${total ? escapeHtml(formatReceiptMoney(total, receipt.currency)) : "-"}</td></tr>`,
      text: `${item.drinkName} x${item.quantity}${modifiers ? ` (${modifiers})` : ""}: ${total ? formatReceiptMoney(total, receipt.currency) : "-"}`,
    };
  });
  const summaryRows = [
    ["Subtotal", receipt.subtotalAmount],
    ...(Number(receipt.discountAmount) > 0
      ? [["Discount", `-${receipt.discountAmount}`]]
      : []),
    ...(Number(receipt.taxAmount) > 0 ? [["Tax", receipt.taxAmount]] : []),
    ...(Number(receipt.chargeAmount) > 0
      ? [["Charges", receipt.chargeAmount]]
      : []),
    ...(Number(receipt.tipAmount) > 0 ? [["Tip", receipt.tipAmount]] : []),
  ];

  return {
    subject: `${receipt.restaurantName} receipt ${receiptReference}`,
    textBody: [
      receipt.restaurantName,
      `Receipt ${receiptReference}`,
      `Order #${receipt.orderNo}`,
      `Issued ${issuedAt}`,
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
    htmlBody: `<div style="max-width:600px;margin:0 auto;font-family:Arial,sans-serif;color:#1c1917"><h1 style="font-size:24px;margin-bottom:4px">${escapeHtml(receipt.restaurantName)}</h1><p style="margin-top:0;color:#78716c">Receipt ${escapeHtml(receiptReference)} &middot; Order #${receipt.orderNo}<br>Issued ${escapeHtml(issuedAt)}</p><table style="width:100%;border-collapse:collapse;margin:24px 0"><thead><tr><th style="padding:8px 0;text-align:left;border-bottom:2px solid #1c1917">Item</th><th style="padding:8px 12px;text-align:center;border-bottom:2px solid #1c1917">Qty</th><th style="padding:8px 0;text-align:right;border-bottom:2px solid #1c1917">Amount</th></tr></thead><tbody>${itemLines.map((line) => line.html).join("")}</tbody></table><table style="width:100%;border-collapse:collapse">${summaryRows.map(([label, amount]) => `<tr><td style="padding:4px 0;color:#57534e">${escapeHtml(label)}</td><td style="padding:4px 0;text-align:right">${escapeHtml(formatReceiptMoney(amount, receipt.currency))}</td></tr>`).join("")}<tr><td style="padding:12px 0 4px;border-top:2px solid #1c1917;font-size:18px;font-weight:bold">Total</td><td style="padding:12px 0 4px;border-top:2px solid #1c1917;text-align:right;font-size:18px;font-weight:bold">${escapeHtml(formatReceiptMoney(receipt.finalTotalAmount, receipt.currency))}</td></tr>${receipt.refundAmount ? `<tr><td style="padding:4px 0;color:#57534e">Refunded</td><td style="padding:4px 0;text-align:right">${escapeHtml(formatReceiptMoney(receipt.refundAmount, receipt.currency))}</td></tr>` : ""}</table><p style="margin-top:28px;color:#57534e">Thank you for your order.</p></div>`,
  };
}
