import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";

import { OrderReceiptDocument } from "@/components/receipt/OrderReceiptDocument";
import { DownloadReceiptButton } from "@/components/receipt/DownloadReceiptButton";
import { PrintReceiptButton } from "@/components/receipt/PrintReceiptButton";
import { VatInvoicePanel } from "@/components/receipt/VatInvoicePanel";
import { AppShell } from "@/components/shared/AppShell";
import { ButtonLabel } from "@/components/shared/ButtonLabel";
import { Button } from "@/components/ui/button";
import type { OrderReceipt } from "@/lib/order-receipt-format";

type ReceiptPageProps = {
  backHref: string;
  canIssueVatInvoice?: boolean;
  receipt: OrderReceipt;
} & (
  | { tone: "customer"; receiptHref: string; autoPrint?: never }
  | { tone?: "default"; receiptHref?: never; autoPrint?: boolean }
);

export function ReceiptPage({
  backHref,
  autoPrint = false,
  canIssueVatInvoice = false,
  receipt,
  receiptHref,
  tone,
}: ReceiptPageProps) {
  const isCustomerReceipt = tone === "customer";

  return (
    <AppShell
      variant={isCustomerReceipt ? "customer" : "neutral"}
      contentClassName="max-w-3xl"
      className="print:bg-white print:px-0 print:py-0"
    >
      <div data-customer-storefront={isCustomerReceipt ? "" : undefined}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <Button asChild variant="outline">
            <Link href={backHref}>
              <ButtonLabel icon={ArrowLeftIcon}>Back to orders</ButtonLabel>
            </Link>
          </Button>
          {tone === "customer" ? (
            <DownloadReceiptButton receiptHref={receiptHref} />
          ) : (
            <PrintReceiptButton autoPrint={autoPrint} />
          )}
        </div>
        {canIssueVatInvoice ? <VatInvoicePanel receipt={receipt} /> : null}
        <OrderReceiptDocument receipt={receipt} />
      </div>
    </AppShell>
  );
}
