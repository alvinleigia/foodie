import "server-only";

import { buildOrderReceiptEmail, type OrderReceipt } from "@/lib/order-receipt-format";
import { resolveOrganizationEmailIntegration } from "@/lib/organization-integrations";
import { sendSmtp2goEmail } from "@/lib/smtp2go";

export class OrderReceiptEmailError extends Error {
  status: number;

  constructor(message: string, status = 409) {
    super(message);
    this.name = "OrderReceiptEmailError";
    this.status = status;
  }
}

export async function sendOrderReceiptEmail(
  organizationId: string,
  receipt: OrderReceipt,
) {
  if (!receipt.customerEmail) {
    throw new OrderReceiptEmailError(
      "Link a customer with a verified email before sending this receipt.",
    );
  }

  const delivery = await resolveOrganizationEmailIntegration(organizationId);

  if (delivery.status !== "CONFIGURED") {
    throw new OrderReceiptEmailError(
      delivery.status === "DISABLED"
        ? "Email delivery is disabled for this restaurant."
        : "Email delivery is not configured for this restaurant.",
    );
  }

  const content = buildOrderReceiptEmail(receipt);

  try {
    await sendSmtp2goEmail({
      apiKey: delivery.apiKey,
      htmlBody: content.htmlBody,
      replyToEmail: delivery.replyToEmail,
      sender: delivery.sender,
      subject: content.subject,
      textBody: content.textBody,
      to: receipt.customerEmail,
    });
  } catch {
    throw new OrderReceiptEmailError(
      "The receipt email could not be delivered. Please try again.",
      502,
    );
  }

  return { recipientEmail: receipt.customerEmail };
}
