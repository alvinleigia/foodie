import { and, eq, inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getDb } from "@/db";
import { orders } from "@/db/schema";
import { requireStaffPermission } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit-log";
import { validateFutureFulfilmentTime } from "@/lib/order-fulfilment-time";
import { serializeOrder } from "@/lib/orders";
import { getCurrentTenantContext } from "@/lib/tenant-context";

const updateFulfilmentTimeSchema = z.object({
  promisedFulfilmentAt: z.iso.datetime().nullable(),
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireStaffPermission("orders.update_status");

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = updateFulfilmentTimeSchema.safeParse(
      await request.json().catch(() => null),
    );

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Choose a valid promised fulfilment time." },
        { status: 400 },
      );
    }

    const promisedFulfilmentAt = parsed.data.promisedFulfilmentAt
      ? new Date(parsed.data.promisedFulfilmentAt)
      : null;
    const fulfilmentTimeError = promisedFulfilmentAt
      ? validateFutureFulfilmentTime(promisedFulfilmentAt)
      : null;

    if (fulfilmentTimeError) {
      return NextResponse.json({ error: fulfilmentTimeError }, { status: 400 });
    }

    const { id } = await context.params;
    const tenantContext = await getCurrentTenantContext();
    const db = getDb();
    const [previousOrder] = await db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.id, id),
          eq(orders.organizationId, tenantContext.organizationId),
          inArray(orders.status, ["PENDING", "PREPARING", "READY"]),
        ),
      )
      .limit(1);

    if (!previousOrder) {
      return NextResponse.json(
        { error: "Only active orders can have their promised time changed." },
        { status: 409 },
      );
    }

    const [updatedOrder] = await db
      .update(orders)
      .set({ promisedFulfilmentAt, updatedAt: new Date() })
      .where(
        and(
          eq(orders.id, id),
          eq(orders.organizationId, tenantContext.organizationId),
          eq(orders.status, previousOrder.status),
        ),
      )
      .returning();

    if (!updatedOrder) {
      return NextResponse.json(
        { error: "Order changed while the promised time was being updated." },
        { status: 409 },
      );
    }

    await writeAuditLog({
      actor: session.user,
      organizationId: tenantContext.organizationId,
      action: "order.fulfilment_time_updated",
      entityType: "order",
      entityId: updatedOrder.id,
      metadata: {
        orderNo: updatedOrder.orderNo,
        previousPromisedFulfilmentAt:
          previousOrder.promisedFulfilmentAt?.toISOString() ?? null,
        promisedFulfilmentAt: updatedOrder.promisedFulfilmentAt?.toISOString() ?? null,
        requestedFulfilmentAt:
          updatedOrder.requestedFulfilmentAt?.toISOString() ?? null,
      },
    });

    return NextResponse.json(serializeOrder(updatedOrder));
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to update promised fulfilment time.",
      },
      { status: 500 },
    );
  }
}
