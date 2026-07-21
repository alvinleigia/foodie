import { formatFinancialDocumentNumber } from "@/lib/financial-document-numbers";
import { getOrderFulfilmentLabel } from "@/lib/order-fulfilment";
import {
  formatOrderFulfilmentTime,
  getEffectiveFulfilmentTime,
} from "@/lib/order-fulfilment-time";
import {
  formatReceiptMoney,
  formatVatRate,
  getInvoiceAddressLines,
  getReceiptItemTotal,
  getVatNetUnitPrice,
  type OrderReceipt,
} from "@/lib/order-receipt-format";

function SummaryRow({
  amount,
  currency,
  label,
}: {
  amount: string;
  currency: string;
  label: string;
}) {
  return (
    <div className="flex items-center justify-between gap-6 py-1.5 text-sm">
      <span className="text-stone-600">{label}</span>
      <span className="font-medium text-stone-950">
        {formatReceiptMoney(amount, currency)}
      </span>
    </div>
  );
}

export function OrderReceiptDocument({ receipt }: { receipt: OrderReceipt }) {
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
  const fulfilmentTime = getEffectiveFulfilmentTime(receipt);

  return (
    <article className="mx-auto w-full max-w-2xl rounded-lg border border-stone-200 bg-white p-6 text-stone-950 shadow-sm print:max-w-none print:border-0 print:p-0 print:shadow-none">
      <header className="border-b-2 border-stone-950 pb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">
          {documentLabel}
        </p>
        <h1 className="mt-2 text-2xl font-semibold">
          {receipt.invoiceSupplierName ?? receipt.restaurantName}
        </h1>
        <div className="mt-3 grid gap-1 text-sm text-stone-600 sm:grid-cols-2">
          <p>{invoiceReference ?? receiptReference}</p>
          <p className="sm:text-right">Order #{receipt.orderNo}</p>
          <p>Issued {issuedAt}</p>
          <p className="sm:text-right">Customer: {receipt.customerName}</p>
          <p>Fulfilment: {getOrderFulfilmentLabel(receipt.fulfilmentType)}</p>
          <p className="sm:text-right">
            {fulfilmentTime
              ? `${fulfilmentTime.label}: ${formatOrderFulfilmentTime(
                  fulfilmentTime.at,
                  { timeZone: receipt.timezone },
                )}`
              : "Timing: As soon as possible"}
          </p>
          {taxPointAt ? <p>Tax point {taxPointAt}</p> : null}
        </div>
        {hasVatInvoice ? (
          <div className="mt-4 grid gap-4 text-sm text-stone-600 sm:grid-cols-2">
            <div>
              <p className="font-medium text-stone-950">Supplier</p>
              {supplierAddress.map((line) => (
                <p key={line}>{line}</p>
              ))}
              <p>VAT registration: {receipt.invoiceSupplierVatNumber}</p>
            </div>
            {receipt.vatInvoiceType === "FULL" &&
            receipt.invoiceCustomerName ? (
              <div className="sm:text-right">
                <p className="font-medium text-stone-950">Customer</p>
                <p>{receipt.invoiceCustomerName}</p>
                {customerAddress.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </header>

      <section className="py-5">
        <div className="grid grid-cols-[1fr_auto_auto] gap-4 border-b border-stone-300 pb-2 text-xs font-semibold uppercase text-stone-500">
          <span>Item</span>
          <span>Qty</span>
          <span className="text-right">Amount</span>
        </div>
        {receipt.items.map((item, index) => {
          const itemTotal = getReceiptItemTotal(item, receipt.currency);
          const netUnitPrice = getVatNetUnitPrice(item, receipt.currency);

          return (
            <div
              key={`${item.drinkName}-${index}`}
              className="grid grid-cols-[1fr_auto_auto] gap-4 border-b border-stone-100 py-3 text-sm"
            >
              <div>
                <p className="font-medium">{item.drinkName}</p>
                {item.modifiers.length > 0 ? (
                  <p className="mt-1 text-xs text-stone-500">
                    {item.modifiers
                      .map(
                        (modifier) =>
                          `${modifier.modifierName}${modifier.quantity > 1 ? ` x${modifier.quantity}` : ""}`,
                      )
                      .join(", ")}
                  </p>
                ) : null}
                {hasVatInvoice &&
                netUnitPrice !== null &&
                item.taxableAmount !== null &&
                item.taxAmount !== null ? (
                  <p className="mt-1 text-xs text-stone-500">
                    Net unit {formatReceiptMoney(netUnitPrice, receipt.currency)};
                    net line {formatReceiptMoney(item.taxableAmount, receipt.currency)};
                    VAT {formatVatRate(item.taxRateBps)}{" "}
                    {formatReceiptMoney(item.taxAmount, receipt.currency)}
                  </p>
                ) : null}
              </div>
              <span>{item.quantity}</span>
              <span className="min-w-20 text-right">
                {itemTotal
                  ? formatReceiptMoney(itemTotal, receipt.currency)
                  : "-"}
              </span>
            </div>
          );
        })}
      </section>

      <section className="ml-auto max-w-sm border-t border-stone-300 pt-3">
        <SummaryRow
          amount={receipt.subtotalAmount}
          currency={receipt.currency}
          label={hasVatInvoice ? "Net total" : "Subtotal"}
        />
        {Number(receipt.discountAmount) > 0 ? (
          <SummaryRow
            amount={`-${receipt.discountAmount}`}
            currency={receipt.currency}
            label="Discount"
          />
        ) : null}
        {Number(receipt.taxAmount) > 0 ? (
          <SummaryRow
            amount={receipt.taxAmount}
            currency={receipt.currency}
            label={hasVatInvoice ? "VAT total" : "Tax"}
          />
        ) : null}
        {hasVatInvoice ? (
          <div className="flex items-center justify-between gap-6 py-1.5 text-sm">
            <span className="text-stone-600">VAT rate</span>
            <span className="font-medium text-stone-950">
              {formatVatRate(receipt.taxRateBps)}
            </span>
          </div>
        ) : null}
        {Number(receipt.chargeAmount) > 0 ? (
          <SummaryRow
            amount={receipt.chargeAmount}
            currency={receipt.currency}
            label="Charges"
          />
        ) : null}
        {Number(receipt.tipAmount) > 0 ? (
          <SummaryRow
            amount={receipt.tipAmount}
            currency={receipt.currency}
            label="Tip"
          />
        ) : null}
        <div className="mt-2 flex items-center justify-between gap-6 border-t-2 border-stone-950 py-3 text-lg font-semibold">
          <span>Total</span>
          <span>{formatReceiptMoney(receipt.finalTotalAmount, receipt.currency)}</span>
        </div>
        {receipt.refundAmount ? (
          <SummaryRow
            amount={receipt.refundAmount}
            currency={receipt.currency}
            label="Refunded"
          />
        ) : null}
      </section>

      {receipt.payments.length > 0 ? (
        <section className="mt-5 border-t border-stone-200 pt-4">
          <h2 className="text-sm font-semibold">Payment</h2>
          {receipt.payments.map((payment, index) => (
            <div
              key={`${payment.method}-${index}`}
              className="mt-2 flex items-center justify-between gap-6 text-sm text-stone-600"
            >
              <span>
                {payment.method === "CASH" ? "Cash" : "Online payment"}
              </span>
              <span>{formatReceiptMoney(payment.amount, receipt.currency)}</span>
            </div>
          ))}
        </section>
      ) : null}

      <footer className="mt-8 text-center text-sm text-stone-500">
        Thank you for your order.
      </footer>
    </article>
  );
}
