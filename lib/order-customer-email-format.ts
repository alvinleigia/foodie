import { formatReceiptMoney } from "@/lib/order-receipt-format";
import {
  getOrderFulfilmentLabel,
  type OrderFulfilmentType,
} from "@/lib/order-fulfilment";
import {
  formatOrderFulfilmentTime,
  getEffectiveFulfilmentTime,
} from "@/lib/order-fulfilment-time";

export type OrderCustomerEmailContent = {
  htmlBody: string;
  subject: string;
  textBody: string;
};

export type OrderCustomerEmailSummary = {
  cancellationFeeAmount: string | null;
  currency: string | null;
  customerName: string;
  fulfilmentType: OrderFulfilmentType;
  items: Array<{ name: string; quantity: number }>;
  orderNo: number;
  promisedFulfilmentAt: Date | null;
  refundAmount: string | null;
  requestedFulfilmentAt: Date | null;
  restaurantName: string;
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

function getFulfilmentLines(order: OrderCustomerEmailSummary) {
  const fulfilmentLabel = getOrderFulfilmentLabel(order.fulfilmentType);
  const fulfilmentTime = getEffectiveFulfilmentTime(order);
  const timing = fulfilmentTime
    ? `${fulfilmentTime.label}: ${formatOrderFulfilmentTime(fulfilmentTime.at, {
        timeZone: order.timezone,
      })}`
    : "Timing: As soon as possible";

  return { fulfilmentLabel, timing };
}

function wrapEmail(input: {
  heading: string;
  intro: string;
  order: OrderCustomerEmailSummary;
  extraLines?: string[];
}) {
  const { fulfilmentLabel, timing } = getFulfilmentLines(input.order);
  const itemLines = input.order.items.map(
    (item) => `${item.name} x${item.quantity}`,
  );
  const extraLines = input.extraLines ?? [];

  return {
    textBody: [
      input.order.restaurantName,
      input.heading,
      `Order #${input.order.orderNo}`,
      input.intro,
      `Fulfilment: ${fulfilmentLabel}`,
      timing,
      "",
      ...itemLines,
      ...extraLines.map((line, index) => (index === 0 ? `\n${line}` : line)),
      "",
      `Customer: ${input.order.customerName}`,
    ].join("\n"),
    htmlBody: `<div style="max-width:600px;margin:0 auto;font-family:Arial,sans-serif;color:#1c1917"><h1 style="font-size:24px;margin-bottom:4px">${escapeHtml(input.order.restaurantName)}</h1><h2 style="font-size:20px;margin:20px 0 8px">${escapeHtml(input.heading)}</h2><p style="color:#57534e">Order #${input.order.orderNo}<br>${escapeHtml(input.intro)}<br>Fulfilment: ${escapeHtml(fulfilmentLabel)}<br>${escapeHtml(timing)}</p><ul style="padding-left:20px">${input.order.items.map((item) => `<li style="margin:6px 0">${escapeHtml(item.name)} x${item.quantity}</li>`).join("")}</ul>${extraLines.length > 0 ? `<p style="margin-top:24px">${extraLines.map(escapeHtml).join("<br>")}</p>` : ""}<p style="margin-top:28px;color:#57534e">Customer: ${escapeHtml(input.order.customerName)}</p></div>`,
  };
}

export function buildOrderConfirmationEmail(
  order: OrderCustomerEmailSummary,
): OrderCustomerEmailContent {
  const content = wrapEmail({
    heading: "Order received",
    intro: "We have received your order and sent it to the restaurant team.",
    order,
  });

  return {
    ...content,
    subject: `${order.restaurantName} order #${order.orderNo} received`,
  };
}

export function buildOrderCancellationEmail(
  order: OrderCustomerEmailSummary,
): OrderCustomerEmailContent {
  const extraLines = [
    ...(order.cancellationFeeAmount && Number(order.cancellationFeeAmount) > 0
      ? [
          `Cancellation fee: ${formatReceiptMoney(
            order.cancellationFeeAmount,
            order.currency ?? "GBP",
          )}`,
        ]
      : []),
    ...(order.refundAmount && Number(order.refundAmount) > 0
      ? ["Any refund due will be confirmed separately when it is processed."]
      : []),
  ];
  const content = wrapEmail({
    heading: "Order cancelled",
    intro: "Your order has been cancelled.",
    order,
    extraLines,
  });

  return {
    ...content,
    subject: `${order.restaurantName} order #${order.orderNo} cancelled`,
  };
}

export function buildOrderRefundEmail(
  order: OrderCustomerEmailSummary,
  refundAmount: string,
  currency: string,
): OrderCustomerEmailContent {
  const formattedAmount = formatReceiptMoney(refundAmount, currency);
  const content = wrapEmail({
    heading: "Refund confirmed",
    intro: `A refund of ${formattedAmount} has been processed for your order.`,
    order,
  });

  return {
    ...content,
    subject: `${order.restaurantName} refund for order #${order.orderNo}`,
  };
}
