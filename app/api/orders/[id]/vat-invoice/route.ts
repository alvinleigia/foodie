import { NextResponse } from "next/server";

import { requireStaffPermission } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit-log";
import { getCurrentTenantContext } from "@/lib/tenant-context";
import { vatInvoiceRequestSchema } from "@/lib/validations/vat-invoice";
import { issueVatInvoice, VatInvoiceError } from "@/lib/vat-invoices";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requireStaffPermission("orders.view");

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = vatInvoiceRequestSchema.safeParse(
    await request.json().catch(() => null),
  );

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Check the VAT invoice details and try again.",
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  try {
    const { id } = await context.params;
    const tenantContext = await getCurrentTenantContext();
    const invoice = await issueVatInvoice(
      id,
      tenantContext.organizationId,
      parsed.data,
    );

    await writeAuditLog({
      actor: session.user,
      action: "order.vat_invoice.issue",
      entityId: id,
      entityType: "order",
      organizationId: tenantContext.organizationId,
      metadata: {
        invoiceNumber: invoice.invoiceNumber,
        invoiceType: invoice.type,
      },
    });

    return NextResponse.json(invoice, { status: 201 });
  } catch (error) {
    const status = error instanceof VatInvoiceError ? error.status : 500;

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The VAT invoice could not be issued.",
      },
      { status },
    );
  }
}
