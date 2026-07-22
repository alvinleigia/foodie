import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";

import { OrderReceiptDocument } from "@/components/receipt/OrderReceiptDocument";
import { PrintReceiptButton } from "@/components/receipt/PrintReceiptButton";
import { VatInvoicePanel } from "@/components/receipt/VatInvoicePanel";
import { AppShell } from "@/components/shared/AppShell";
import { ButtonLabel } from "@/components/shared/ButtonLabel";
import { Button } from "@/components/ui/button";
import type { OrderReceipt } from "@/lib/order-receipt-format";

export function ReceiptPage({
  backHref,
  canIssueVatInvoice = false,
  receipt,
}: {
  backHref: string;
  canIssueVatInvoice?: boolean;
  receipt: OrderReceipt;
}) {
  return (
    <AppShell
      variant="neutral"
      contentClassName="max-w-3xl"
      className="print:bg-white print:px-0 print:py-0"
    >
      <div className="mb-4 flex items-center justify-between gap-3 print:hidden">
        <Button asChild variant="outline">
          <Link href={backHref}>
            <ButtonLabel icon={ArrowLeftIcon}>Back to orders</ButtonLabel>
          </Link>
        </Button>
        <PrintReceiptButton />
      </div>
      {canIssueVatInvoice ? <VatInvoicePanel receipt={receipt} /> : null}
      <OrderReceiptDocument receipt={receipt} />
    </AppShell>
  );
}
