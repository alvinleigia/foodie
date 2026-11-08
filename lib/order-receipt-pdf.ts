import { readFileSync } from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";

import { formatFinancialDocumentNumber } from "@/lib/financial-document-numbers";
import { getOrderFulfilmentLabel } from "@/lib/order-fulfilment";
import { formatOrderFulfilmentTime, getEffectiveFulfilmentTime } from "@/lib/order-fulfilment-time";
import {
  formatReceiptMoney,
  formatReceiptTaxComponentLabel,
  getInvoiceAddressLines,
  getReceiptItemTotal,
  getVatNetUnitPrice,
  type OrderReceipt,
} from "@/lib/order-receipt-format";

const regularFontPath = path.join(process.cwd(), "assets/fonts/NotoSans-Regular.ttf");
const regularFont = readFileSync(regularFontPath);
const boldFont = readFileSync(path.join(process.cwd(), "assets/fonts/NotoSans-Bold.ttf"));

export function buildOrderReceiptPdf(receipt: OrderReceipt): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48, font: regularFontPath });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.registerFont("Regular", regularFont);
    doc.registerFont("Bold", boldFont);

    const width = doc.page.width - 96;
    const hasVatInvoice = Boolean(
      receipt.vatInvoiceType && receipt.invoiceNumber && receipt.invoiceIssuedAt &&
      receipt.invoiceTaxPointAt && receipt.invoiceSupplierName && receipt.invoiceSupplierVatNumber,
    );
    const label = hasVatInvoice
      ? `${receipt.vatInvoiceType === "FULL" ? "Full" : "Simplified"} VAT invoice`
      : "Receipt";
    const reference = formatFinancialDocumentNumber(
      hasVatInvoice ? "INVOICE" : "RECEIPT",
      hasVatInvoice ? receipt.invoiceNumber! : receipt.receiptNumber,
    );
    const money = (amount: string) => formatReceiptMoney(amount, receipt.currency);
    const date = (value: Date) => new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium", timeStyle: "short", timeZone: receipt.timezone,
    }).format(value);

    function paragraph(text: string, bold = false, size = 10) {
      doc.font(bold ? "Bold" : "Regular").fontSize(size).fillColor("#263b36")
        .text(text, 48, doc.y, { width, lineGap: 3 });
      doc.moveDown(0.4);
    }

    function rule() {
      if (doc.y + 20 > doc.page.height - 48) doc.addPage();
      doc.moveDown(0.4);
      doc.moveTo(48, doc.y).lineTo(48 + width, doc.y).strokeColor("#dce5e1").stroke();
      doc.moveDown(0.8);
    }

    function row(name: string, value: string, bold = false) {
      doc.font(bold ? "Bold" : "Regular").fontSize(bold ? 12 : 10).fillColor("#263b36");
      const leftWidth = width * 0.72;
      const rightWidth = width * 0.25;
      const height = Math.max(
        doc.heightOfString(name, { width: leftWidth }),
        doc.heightOfString(value, { width: rightWidth }),
      );
      if (doc.y + height + 8 > doc.page.height - 48) doc.addPage();
      const y = doc.y;
      doc.text(name, 48, y, { width: leftWidth });
      doc.text(value, 48 + width - rightWidth, y, { width: rightWidth, align: "right" });
      doc.y = y + height + 8;
    }

    doc.info.Title = `${label} ${reference}`;
    doc.info.Author = receipt.restaurantName;
    paragraph(receipt.invoiceSupplierName ?? receipt.restaurantName, true, 22);
    paragraph(`${label} ${reference}`, true, 13);
    paragraph(`Order #${receipt.orderNo} | Issued ${date(receipt.invoiceIssuedAt ?? receipt.receiptIssuedAt)}`);
    paragraph(`Customer: ${receipt.customerName}`);
    paragraph(`Fulfilment: ${getOrderFulfilmentLabel(receipt.fulfilmentType)}`);
    const time = getEffectiveFulfilmentTime(receipt);
    paragraph(time
      ? `${time.label}: ${formatOrderFulfilmentTime(time.at, { timeZone: receipt.timezone })}`
      : "Timing: As soon as possible");

    if (hasVatInvoice) {
      const addresses = getInvoiceAddressLines(receipt);
      paragraph(`Tax point: ${date(receipt.invoiceTaxPointAt!)}`);
      paragraph(`Supplier: ${addresses.supplier.join(", ")}`);
      paragraph(`VAT registration: ${receipt.invoiceSupplierVatNumber}`);
      if (receipt.vatInvoiceType === "FULL" && receipt.invoiceCustomerName) {
        paragraph(`Invoice customer: ${receipt.invoiceCustomerName}`);
        paragraph(addresses.customer.join(", "));
      }
    }

    rule();
    for (const item of receipt.items) {
      const total = getReceiptItemTotal(item, receipt.currency);
      row(`${item.drinkName} x${item.quantity}`, total === null ? "-" : money(total), true);
      if (item.modifiers.length) {
        paragraph(item.modifiers.map((modifier) =>
          `${modifier.modifierName}${modifier.quantity > 1 ? ` x${modifier.quantity}` : ""}`,
        ).join(", "));
      }
      const netUnit = getVatNetUnitPrice(item, receipt.currency);
      if (hasVatInvoice && netUnit !== null && item.taxableAmount !== null) {
        paragraph(`Net unit ${money(netUnit)}; net line ${money(item.taxableAmount)}`);
      }
      for (const tax of item.taxComponents) {
        paragraph(`${formatReceiptTaxComponentLabel(tax)}: ${money(tax.taxAmount)}`);
      }
      doc.moveDown(0.5);
    }

    rule();
    row(hasVatInvoice ? "Net total" : "Subtotal", money(receipt.subtotalAmount));
    if (Number(receipt.discountAmount) > 0) row("Discount", money(`-${receipt.discountAmount}`));
    for (const tax of receipt.taxSummary) row(formatReceiptTaxComponentLabel(tax), money(tax.taxAmount));
    if (!receipt.taxSummary.length && Number(receipt.taxAmount) > 0) {
      row(hasVatInvoice ? "VAT total" : "Tax", money(receipt.taxAmount));
    }
    if (Number(receipt.chargeAmount) > 0) row("Charges", money(receipt.chargeAmount));
    if (Number(receipt.tipAmount) > 0) row("Tip", money(receipt.tipAmount));
    row("Total", money(receipt.finalTotalAmount), true);
    if (receipt.refundAmount) row("Refunded", money(receipt.refundAmount));

    if (receipt.payments.length) {
      rule();
      paragraph("Payment", true);
      for (const payment of receipt.payments) {
        row(payment.method === "CASH" ? "Cash" : "Online payment", money(payment.amount));
      }
    }
    rule();
    paragraph(receipt.footerMessage ?? "Thank you for your order.");
    doc.end();
  });
}
