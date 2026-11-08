import { notFound, redirect } from "next/navigation";

import { ReceiptPage } from "@/components/receipt/ReceiptPage";
import { withPublicCustomerContext } from "@/lib/customer-navigation";
import { getCustomerReceipt } from "@/lib/customer-receipts";

type CustomerReceiptPageProps = {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CustomerReceiptPage({
  params,
  searchParams,
}: CustomerReceiptPageProps) {
  const [{ orderId }, query] = await Promise.all([params, searchParams]);
  const result = await getCustomerReceipt(orderId, query);
  if (result.status === "sign-in") redirect(result.loginHref);
  if (result.status === "not-found") notFound();

  const receiptUrl = new URL(
    withPublicCustomerContext(
      `/order/receipt/${encodeURIComponent(orderId)}`,
      result.customerContext,
    ),
    "https://foodie.local",
  );
  if (typeof query.session_id === "string") {
    receiptUrl.searchParams.set("session_id", query.session_id);
  }

  return (
    <ReceiptPage
      backHref={withPublicCustomerContext("/order/status", result.customerContext)}
      receipt={result.receipt}
      receiptHref={`${receiptUrl.pathname}${receiptUrl.search}`}
      tone="customer"
    />
  );
}
