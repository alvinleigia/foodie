import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireStaffPermission } from "@/lib/auth";
import {
  CashDrawerSessionError,
  getOpenCashDrawerSession,
  openCashDrawerSession,
} from "@/lib/cash-drawer-sessions";
import { logError } from "@/lib/logger";
import { getCurrentTenantContext } from "@/lib/tenant-context";

const openSessionSchema = z.object({
  openingFloat: z.string().trim().min(1).max(20),
  orderingPointId: z.string().uuid().optional(),
});

function getOrderingPointId(
  requestedOrderingPointId: string | null | undefined,
  defaultOrderingPointId: string | null,
) {
  const orderingPointId = requestedOrderingPointId ?? defaultOrderingPointId;

  if (!orderingPointId) {
    throw new CashDrawerSessionError(
      "Configure an active ordering point before opening the cash drawer.",
      409,
    );
  }

  return orderingPointId;
}

function errorResponse(error: unknown) {
  if (error instanceof CashDrawerSessionError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  logError("cash_drawer_session_failed", error);

  return NextResponse.json(
    { error: "Cash drawer session could not be processed." },
    { status: 500 },
  );
}

export async function GET(request: NextRequest) {
  try {
    const staffSession = await requireStaffPermission("cash_drawer.open");

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
    const session = await getOpenCashDrawerSession({
      orderingPointId,
      organizationId: tenantContext.organizationId,
    });

    return NextResponse.json({ session });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const staffSession = await requireStaffPermission("cash_drawer.open");

    if (!staffSession) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = openSessionSchema.safeParse(
      await request.json().catch(() => ({})),
    );

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Enter a valid opening float." },
        { status: 400 },
      );
    }

    const tenantContext = await getCurrentTenantContext();
    const orderingPointId = getOrderingPointId(
      parsed.data.orderingPointId,
      tenantContext.orderingPointId,
    );
    const session = await openCashDrawerSession({
      actor: staffSession.user,
      openingFloat: parsed.data.openingFloat,
      orderingPointId,
      organizationId: tenantContext.organizationId,
    });

    return NextResponse.json({ session }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
