import { NextRequest, NextResponse } from "next/server";
import { generateCustomerToken } from "@/lib/order-token";
import { getLocationBusinessDate, getNextOrderNumber } from "@/lib/order-number";
import { createOrderSchema } from "@/lib/validations/order";
import {
  buildOrderSummary,
  getStaffOrders,
  getOrderItemsForOrders,
  serializeOrder,
} from "@/lib/orders";
import { getOrdersResetAt } from "@/lib/order-reset";
import {
  getMenuModifierSelectionSnapshots,
  getMenuSelectionSnapshot,
  getTenantMenuCurrency,
} from "@/lib/menu";
import {
  InventoryReservationError,
  reserveInventoryForOrderItem,
} from "@/lib/inventory";
import { getDb } from "@/db";
import { orderItemModifiers, orderItems, orders } from "@/db/schema";
import { requireStaffSession } from "@/lib/auth";
import { canAccessRole, restaurantAdminRoles } from "@/lib/role-access";
import {
  checkRateLimit,
  getRequestRateLimitKey,
  rateLimitResponse,
} from "@/lib/rate-limit";
import { getCurrentTenantContext, getPublicTenantContextFromRequest } from "@/lib/tenant-context";

export async function GET() {
  try {
    const session = await requireStaffSession();

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantContext = await getCurrentTenantContext();
    const [{ activeOrders, pastOrders }, currency] = await Promise.all([
      getStaffOrders(tenantContext),
      getTenantMenuCurrency(tenantContext),
    ]);
    const itemMap = await getOrderItemsForOrders(
      [...activeOrders, ...pastOrders].map((order) => order.id),
      tenantContext,
    );

    return NextResponse.json({
      activeOrders: activeOrders.map((order) => serializeOrder(order, itemMap.get(order.id) ?? [])),
      pastOrders: pastOrders.map((order) => serializeOrder(order, itemMap.get(order.id) ?? [])),
      canCorrectStatuses: canAccessRole(session.user.role, restaurantAdminRoles),
      currency,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch orders." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const rateLimit = checkRateLimit({
      key: getRequestRateLimitKey(request, "public:order-create"),
      limit: 12,
      windowMs: 60_000,
    });

    if (!rateLimit.allowed) {
      return rateLimitResponse(rateLimit);
    }

    const body = await request.json();
    const parsed = createOrderSchema.safeParse(body);
    const tenantContext = await getPublicTenantContextFromRequest(request);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const requestedQuantityByDrinkId = new Map<string, number>();

    for (const requestedItem of parsed.data.items) {
      requestedQuantityByDrinkId.set(
        requestedItem.drinkId,
        (requestedQuantityByDrinkId.get(requestedItem.drinkId) ?? 0) + requestedItem.quantity,
      );
    }

    const cartItems: Array<{
      categoryId: string;
      organizationId: string;
      locationId: string;
      categoryName: string;
      drinkId: string;
      drinkName: string;
      quantity: number;
      notes: string | null;
      unitPrice: string | null;
      status: "PENDING";
      shouldReserveInventory: boolean;
      modifiers: Array<{
        modifierGroupId: string;
        modifierGroupName: string;
        modifierId: string;
        modifierName: string;
        quantity: number;
        priceDelta: string;
      }>;
      startedAt: null;
      readyAt: null;
      deliveredAt: null;
      cancelledAt: null;
    }> = [];

    for (const requestedItem of parsed.data.items) {
      const { category, inventory, item } = await getMenuSelectionSnapshot(
        requestedItem.categoryId,
        requestedItem.drinkId,
        tenantContext,
      );

      if (!category || !item) {
        return NextResponse.json({ error: "Invalid drink selection." }, { status: 400 });
      }

      const totalRequestedQuantity = requestedQuantityByDrinkId.get(item.id) ?? requestedItem.quantity;

      if (inventory?.isTracked && Number(inventory.currentQuantity) < totalRequestedQuantity) {
        return NextResponse.json(
          { error: `Only ${inventory.currentQuantity} available for ${item.name}.` },
          { status: 409 },
        );
      }

      const modifiers = await getMenuModifierSelectionSnapshots(
        item.id,
        requestedItem.modifiers,
        tenantContext,
      );

      cartItems.push({
        categoryId: category.id,
        organizationId: tenantContext.organizationId,
        locationId: tenantContext.locationId,
        categoryName: category.name,
        drinkId: item.id,
        drinkName: item.name,
        quantity: requestedItem.quantity,
        notes: requestedItem.notes?.trim() || null,
        unitPrice: item.price ?? null,
        status: "PENDING",
        shouldReserveInventory: Boolean(inventory?.isTracked),
        modifiers,
        startedAt: null,
        readyAt: null,
        deliveredAt: null,
        cancelledAt: null,
      });
    }

    const db = getDb();
    const customerToken = generateCustomerToken();
    const summaryCategoryName =
      cartItems.length === 1 ? cartItems[0].categoryName : `${cartItems.length} categories`;
    const summaryDrinkName = buildOrderSummary(
      cartItems.map((item) => ({ drinkName: item.drinkName, quantity: item.quantity })),
    );

    const createdOrder = await db.transaction(async (tx) => {
      const orderDate = await getLocationBusinessDate(tx, tenantContext);
      const orderNo = await getNextOrderNumber(tx, tenantContext, orderDate);
      const [newOrder] = await tx
        .insert(orders)
        .values({
          organizationId: tenantContext.organizationId,
          locationId: tenantContext.locationId,
          orderDate,
          orderNo,
          customerName: parsed.data.customerName.trim(),
          customerToken,
          categoryId: cartItems[0].categoryId,
          categoryName: summaryCategoryName,
          drinkId: cartItems[0].drinkId,
          drinkName: summaryDrinkName,
        })
        .returning();

      const now = new Date();
      for (const item of cartItems) {
        const inventoryReservedAt = item.shouldReserveInventory
          ? await reserveInventoryForOrderItem(tx, tenantContext, item).then((wasReserved) =>
              wasReserved ? now : null,
            )
          : null;

        const [newOrderItem] = await tx
          .insert(orderItems)
          .values({
            organizationId: tenantContext.organizationId,
            locationId: tenantContext.locationId,
            orderId: newOrder.id,
            categoryId: item.categoryId,
            categoryName: item.categoryName,
            drinkId: item.drinkId,
            drinkName: item.drinkName,
            quantity: item.quantity,
            notes: item.notes,
            unitPrice: item.unitPrice,
            inventoryReservedAt,
            updatedAt: now,
          })
          .returning({ id: orderItems.id });

        if (item.modifiers.length > 0 && newOrderItem) {
          await tx.insert(orderItemModifiers).values(
            item.modifiers.map((modifier) => ({
              organizationId: tenantContext.organizationId,
              locationId: tenantContext.locationId,
              orderItemId: newOrderItem.id,
              modifierGroupId: modifier.modifierGroupId,
              modifierGroupName: modifier.modifierGroupName,
              modifierId: modifier.modifierId,
              modifierName: modifier.modifierName,
              quantity: modifier.quantity,
              priceDelta: modifier.priceDelta,
            })),
          );
        }
      }

      return newOrder;
    });

    return NextResponse.json({
      ...serializeOrder(createdOrder, cartItems),
      currency: await getTenantMenuCurrency(tenantContext),
      ordersResetAt: await getOrdersResetAt(),
    });
  } catch (error) {
    if (error instanceof InventoryReservationError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create order." },
      { status: 500 },
    );
  }
}
