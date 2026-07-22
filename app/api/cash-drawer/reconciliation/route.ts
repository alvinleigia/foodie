import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireStaffPermission } from "@/lib/auth";
import {
  CashDrawerReconciliationError,
  closeCashDrawerSession,
  getOpenCashDrawerReconciliation,
} from "@/lib/cash-drawer-reconciliation";
import { CashDrawerSessionError } from "@/lib/cash-drawer-sessions";
import { logError } from "@/lib/logger";
import { getCurrentTenantContext } from "@/lib/tenant-context";

const closeDrawerSchema = z.object({
  closingNote: z.string().trim().max(500).optional(),
  countedCashAmount: z.string().trim().min(1).max(20),
  orderingPointId: z.string().uuid().optional(),
});

function getOrderingPointId(
  requestedOrderingPointId: string | null | undefined,
  defaultOrderingPointId: string | null,
) {
  const orderingPointId = requestedOrderingPointId ?? defaultOrderingPointId;

  if (!orderingPointId) {
    throw new CashDrawerSessionError(
      "Configure an active ordering point before using the cash drawer.",
      409,
    );
  }

  return orderingPointId;
}

function errorResponse(error: unknown) {
  if (
    error instanceof CashDrawerReconciliationError ||
    error instanceof CashDrawerSessionError
  ) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  logError("cash_drawer_reconciliation_failed", error);

  return NextResponse.json(
    { error: "Cash drawer reconciliation could not be processed." },
    { status: 500 },
  );
}

export async function GET(request: NextRequest) {
  try {
    const staffSession = await requireStaffPermission("cash_drawer.close");

    if (!staffSession) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantContext = await getCurrentTenantContext();
    const requestedOrderingPointId = request.nextUrl.searchParams.get(
      "orderingPointId",
    );

    if (
      requestedOrderingPointId &&
      !z.string().uuid().safeParse(requestedOrderingPointId).success
    ) {
      return NextResponse.json(
        { error: "Choose a valid ordering point." },
        { status: 400 },
      );
    }

    const orderingPointId = getOrderingPointId(
      requestedOrderingPointId,
      tenantContext.orderingPointId,
    );
    const reconciliation = await getOpenCashDrawerReconciliation({
      orderingPointId,
      organizationId: tenantContext.organizationId,
    });

    return NextResponse.json({ reconciliation });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const staffSession = await requireStaffPermission("cash_drawer.close");

    if (!staffSession) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = closeDrawerSchema.safeParse(
      await request.json().catch(() => ({})),
    );

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Enter a valid counted cash amount." },
        { status: 400 },
      );
    }

    const tenantContext = await getCurrentTenantContext();
    const orderingPointId = getOrderingPointId(
      parsed.data.orderingPointId,
      tenantContext.orderingPointId,
    );
    const result = await closeCashDrawerSession({
      actor: staffSession.user,
      closingNote: parsed.data.closingNote,
      countedCashAmount: parsed.data.countedCashAmount,
      orderingPointId,
      organizationId: tenantContext.organizationId,
    });

    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
