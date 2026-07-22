import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireStaffPermission } from "@/lib/auth";
import {
  CashDrawerMovementError,
  listOpenCashDrawerMovements,
  recordCashDrawerMovement,
} from "@/lib/cash-drawer-movements";
import { CashDrawerSessionError } from "@/lib/cash-drawer-sessions";
import { logError } from "@/lib/logger";
import { getCurrentTenantContext } from "@/lib/tenant-context";

const movementSchema = z.object({
  amount: z.string().trim().min(1).max(20),
  note: z.string().trim().max(500).optional(),
  orderingPointId: z.string().uuid().optional(),
  reason: z.string().trim().min(1).max(120),
  type: z.enum(["PAID_IN", "PAID_OUT"]),
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
    error instanceof CashDrawerMovementError ||
    error instanceof CashDrawerSessionError
  ) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  logError("cash_drawer_movement_failed", error);

  return NextResponse.json(
    { error: "Cash drawer movement could not be processed." },
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
    const movements = await listOpenCashDrawerMovements({
      orderingPointId,
      organizationId: tenantContext.organizationId,
    });

    return NextResponse.json({ movements });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const staffSession = await requireStaffPermission("cash_drawer.adjust");

    if (!staffSession) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = movementSchema.safeParse(
      await request.json().catch(() => ({})),
    );

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Enter an amount and choose a valid reason." },
        { status: 400 },
      );
    }

    const tenantContext = await getCurrentTenantContext();
    const orderingPointId = getOrderingPointId(
      parsed.data.orderingPointId,
      tenantContext.orderingPointId,
    );
    const movement = await recordCashDrawerMovement({
      actor: staffSession.user,
      amount: parsed.data.amount,
      note: parsed.data.note,
      orderingPointId,
      organizationId: tenantContext.organizationId,
      reason: parsed.data.reason,
      type: parsed.data.type,
    });

    return NextResponse.json({ movement }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
