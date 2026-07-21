import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireStaffSession } from "@/lib/auth";
import { logError } from "@/lib/logger";
import { staffOrderAdjustmentReasonCodes } from "@/lib/order-adjustments";
import {
  applyStaffOrderAdjustment,
  removeStaffOrderAdjustment,
  StaffOrderAdjustmentError,
} from "@/lib/staff-order-adjustments";
import { getCurrentTenantContext } from "@/lib/tenant-context";

const adjustmentSchema = z
  .object({
    calculation: z.enum(["FIXED_AMOUNT", "PERCENTAGE"]),
    note: z.string().trim().max(200).optional(),
    reasonCode: z.enum(staffOrderAdjustmentReasonCodes),
    type: z.enum(["DISCOUNT", "COMP"]),
    value: z.string().trim().max(20).optional(),
  })
  .superRefine((value, context) => {
    if (value.type === "COMP") {
      return;
    }

    if (!value.value || !/^\d+(?:\.\d{1,2})?$/.test(value.value)) {
      context.addIssue({
        code: "custom",
        message: "Enter a valid discount value with no more than two decimals.",
        path: ["value"],
      });
      return;
    }

    if (value.calculation === "PERCENTAGE" && Number(value.value) >= 100) {
      context.addIssue({
        code: "custom",
        message: "Use comp to waive the full bill.",
        path: ["value"],
      });
    }
  });

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireStaffSession();

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = adjustmentSchema.safeParse(
      await request.json().catch(() => null),
    );

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Choose a valid adjustment." },
        { status: 400 },
      );
    }

    const { id } = await context.params;
    const tenantContext = await getCurrentTenantContext();
    const result = await applyStaffOrderAdjustment({
      actor: session.user,
      orderId: id,
      organizationId: tenantContext.organizationId,
      ...parsed.data,
    });

    return NextResponse.json({
      adjustment: result.adjustment,
      paymentAmount: result.order.paymentAmount,
      paymentStatus: result.order.paymentStatus,
    });
  } catch (error) {
    if (error instanceof StaffOrderAdjustmentError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }

    logError("staff_order_adjustment_save_failed", error);

    return NextResponse.json(
      { error: "The order adjustment could not be saved." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireStaffSession();

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const tenantContext = await getCurrentTenantContext();
    const result = await removeStaffOrderAdjustment({
      actor: session.user,
      orderId: id,
      organizationId: tenantContext.organizationId,
    });

    return NextResponse.json({
      paymentAmount: result.order.paymentAmount,
      paymentStatus: result.order.paymentStatus,
    });
  } catch (error) {
    if (error instanceof StaffOrderAdjustmentError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }

    logError("staff_order_adjustment_remove_failed", error);

    return NextResponse.json(
      { error: "The order adjustment could not be removed." },
      { status: 500 },
    );
  }
}
