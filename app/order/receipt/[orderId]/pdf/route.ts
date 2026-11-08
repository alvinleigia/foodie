import { getCustomerReceipt } from "@/lib/customer-receipts";
import { formatFinancialDocumentNumber } from "@/lib/financial-document-numbers";
import { buildOrderReceiptPdf } from "@/lib/order-receipt-pdf";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const { orderId } = await params;
  const query = Object.fromEntries(new URL(request.url).searchParams);
  const result = await getCustomerReceipt(orderId, query);
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };

  if (result.status === "sign-in") {
    return Response.json(
      { error: "Sign in to download this receipt.", loginHref: result.loginHref },
      { status: 401, headers },
    );
  }
  if (result.status === "not-found") {
    return Response.json(
      { error: "Receipt not found." },
      { status: 404, headers },
    );
  }

  const pdf = await buildOrderReceiptPdf(result.receipt);
  const reference = formatFinancialDocumentNumber(
    "RECEIPT",
    result.receipt.receiptNumber,
  );
  return new Response(new Uint8Array(pdf), {
    headers: {
      ...headers,
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="receipt-${reference}.pdf"`,
    },
  });
}
