import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { getDb } from "@/db";
import { orderItems, orders } from "@/db/schema";
import { requireStaffSession } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit-log";
import {
  checkRateLimit,
  getRequestRateLimitKey,
  rateLimitResponse,
} from "@/lib/rate-limit";
import { restoreReservedInventoryForOrderItem } from "@/lib/inventory";
import { customerCancelOrderSchema, staffCancelOrderSchema } from "@/lib/validations/order";
import { serializeOrder } from "@/lib/orders";
import { getCurrentTenantContext, getPublicTenantContextFromRequest } from "@/lib/tenant-context";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const session = await requireStaffSession();
    const isStaff = Boolean(session);

    if (!isStaff) {
      const rateLimit = checkRateLimit({
        key: getRequestRateLimitKey(request, "public:order-cancel"),
        limit: 20,
        windowMs: 60_000,
      });

      if (!rateLimit.allowed) {
        return rateLimitResponse(rateLimit);
      }
    }

    const tenantContext = isStaff
      ? await getCurrentTenantContext()
      : await getPublicTenantContextFromRequest(request);
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

    const parsed = isStaff
      ? staffCancelOrderSchema.safeParse(body)
      : customerCancelOrderSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    if (isStaff) {
      if (order.status !== "PENDING" && order.status !== "READY") {
        return NextResponse.json(
          {
            error:
              "Staff can only cancel orders while they are pending or ready for pickup.",
          },
          { status: 409 },
        );
      }

      const updatedOrder = await db.transaction(async (tx) => {
        const now = new Date();
        const items = await tx
          .select()
          .from(orderItems)
          .where(
            and(
              eq(orderItems.orderId, id),
              eq(orderItems.organizationId, tenantContext.organizationId),
            ),
          );

        for (const item of items.filter(
          (currentItem) =>
            currentItem.inventoryReservedAt && currentItem.status !== "DELIVERED",
        )) {
          await restoreReservedInventoryForOrderItem(tx, tenantContext, item);
        }

        await tx
          .update(orderItems)
          .set({
            status: "CANCELLED",
            cancelledAt: now,
            inventoryReservedAt: null,
            updatedAt: now,
          })
          .where(
            and(
              eq(orderItems.orderId, id),
              eq(orderItems.organizationId, tenantContext.organizationId),
            ),
          );

        const [nextOrder] = await tx
          .update(orders)
          .set({
            status: "CANCELLED",
            cancelReason: parsed.data.cancelReason?.trim() || null,
            cancelledAt: now,
            cancelledByType: "STAFF",
            updatedAt: now,
          })
          .where(
            and(
              eq(orders.id, id),
              eq(orders.organizationId, tenantContext.organizationId),
            ),
          )
          .returning();

        return nextOrder;
      });

      await writeAuditLog({
        actor: session?.user,
        organizationId: tenantContext.organizationId,
        action: "order.cancel.staff",
        entityType: "order",
        entityId: updatedOrder.id,
        metadata: {
          orderNo: updatedOrder.orderNo,
          previousStatus: order.status,
          nextStatus: updatedOrder.status,
          cancelledByType: updatedOrder.cancelledByType,
          hasCancelReason: Boolean(updatedOrder.cancelReason),
        },
      });

      return NextResponse.json(serializeOrder(updatedOrder));
    }

    if (order.status !== "PENDING") {
      return NextResponse.json(
        {
          error:
            "This order cannot be cancelled because preparation has already started.",
        },
        { status: 409 },
      );
    }

    const customerPayload = customerCancelOrderSchema.parse(body);

    if (customerPayload.customerToken !== order.customerToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const updatedOrder = await db.transaction(async (tx) => {
      const now = new Date();
      const items = await tx
        .select()
        .from(orderItems)
        .where(
          and(
            eq(orderItems.orderId, id),
            eq(orderItems.organizationId, tenantContext.organizationId),
          ),
        );

      for (const item of items.filter(
        (currentItem) =>
          currentItem.inventoryReservedAt && currentItem.status !== "DELIVERED",
      )) {
        await restoreReservedInventoryForOrderItem(tx, tenantContext, item);
      }

      await tx
        .update(orderItems)
        .set({
          status: "CANCELLED",
          cancelledAt: now,
          inventoryReservedAt: null,
          updatedAt: now,
        })
        .where(
          and(
            eq(orderItems.orderId, id),
            eq(orderItems.organizationId, tenantContext.organizationId),
          ),
        );

      const [nextOrder] = await tx
        .update(orders)
        .set({
          status: "CANCELLED",
          cancelReason: customerPayload.cancelReason?.trim() || null,
          cancelledAt: now,
          cancelledByType: "CUSTOMER",
          updatedAt: now,
        })
        .where(
          and(
            eq(orders.id, id),
            eq(orders.organizationId, tenantContext.organizationId),
          ),
        )
        .returning();

      return nextOrder;
    });

    await writeAuditLog({
      actor: null,
      organizationId: tenantContext.organizationId,
      action: "order.cancel.customer",
      entityType: "order",
      entityId: updatedOrder.id,
      metadata: {
        orderNo: updatedOrder.orderNo,
        previousStatus: order.status,
        nextStatus: updatedOrder.status,
        cancelledByType: updatedOrder.cancelledByType,
        hasCancelReason: Boolean(updatedOrder.cancelReason),
      },
    });

    return NextResponse.json(serializeOrder(updatedOrder));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to cancel order." },
      { status: 500 },
    );
  }
}
