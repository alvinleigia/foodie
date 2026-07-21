import { NextResponse } from "next/server";

import { requireStaffSession } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit-log";
import {
  OrderReceiptEmailError,
  sendOrderReceiptEmail,
} from "@/lib/order-receipt-email";
import { getOrderReceipt } from "@/lib/order-receipts";
import { getCurrentTenantContext } from "@/lib/tenant-context";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requireStaffSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const tenantContext = await getCurrentTenantContext();
    const receipt = await getOrderReceipt(id, tenantContext);

    if (!receipt) {
      return NextResponse.json(
        { error: "A finalized receipt is not available for this order." },
        { status: 404 },
      );
    }

    const result = await sendOrderReceiptEmail(
      tenantContext.organizationId,
      receipt,
    );

    await writeAuditLog({
      actor: session.user,
      action: "order.receipt.email",
      entityId: receipt.orderId,
      entityType: "order",
      organizationId: tenantContext.organizationId,
      metadata: {
        receiptNumber: receipt.receiptNumber,
        recipient: "linked_customer",
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    const status = error instanceof OrderReceiptEmailError ? error.status : 500;

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The receipt email could not be sent.",
      },
      { status },
    );
  }
}
