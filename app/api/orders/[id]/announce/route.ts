import { and, eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { getDb } from "@/db";
import { orders } from "@/db/schema";
import { requireStaffSession } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit-log";
import {
  OrderTransitionConflictError,
  requireOrderTransitionResult,
} from "@/lib/order-transition";
import { serializeOrder } from "@/lib/orders";
import { getCurrentTenantContext } from "@/lib/tenant-context";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireStaffSession();

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const tenantContext = await getCurrentTenantContext();
    const db = getDb();
    const [order] = await db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.id, id),
          eq(orders.organizationId, tenantContext.organizationId),
        ),
      );

    if (!order) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }

    if (order.status !== "READY") {
      return NextResponse.json(
        { error: "Only ready orders can be announced." },
        { status: 409 },
      );
    }

    const [updatedOrder] = await db
      .update(orders)
      .set({
        announcementCount: sql`${orders.announcementCount} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(orders.id, id),
          eq(orders.organizationId, tenantContext.organizationId),
          eq(orders.status, order.status),
        ),
      )
      .returning();
    const announcedOrder = requireOrderTransitionResult(updatedOrder);

    await writeAuditLog({
      actor: session.user,
      organizationId: tenantContext.organizationId,
      action: "order.announce",
      entityType: "order",
      entityId: announcedOrder.id,
      metadata: {
        orderNo: announcedOrder.orderNo,
        status: announcedOrder.status,
        announcementCount: announcedOrder.announcementCount,
      },
    });

    return NextResponse.json(serializeOrder(announcedOrder));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to record announcement." },
      { status: error instanceof OrderTransitionConflictError ? 409 : 500 },
    );
  }
}
