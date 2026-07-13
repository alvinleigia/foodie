import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
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
import {
  getCustomerProfile,
  getStaffVisibleCustomer,
} from "@/lib/customer-account";
import {
  canAccessRole,
  operationalRoles,
  restaurantAdminRoles,
} from "@/lib/role-access";
import {
  checkRateLimit,
  getRequestRateLimitKey,
  rateLimitResponse,
} from "@/lib/rate-limit";
import { getCurrentTenantContext, getPublicTenantContextFromRequest } from "@/lib/tenant-context";
import { isValidCustomerPhone } from "@/lib/validations/customer";
import {
  buildOrderPaymentPricing,
  cancelPendingOrderPaymentByOrderId,
  createOrderCheckoutSession,
} from "@/lib/order-payments";
import { getStripe } from "@/lib/stripe";
import { logError } from "@/lib/logger";

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
    const session = await auth();

    if (!session?.user || (session.user.kind !== "staff" && session.user.kind !== "customer")) {
      return NextResponse.json({ error: "Sign in before placing an order." }, { status: 401 });
    }

    if (
      session.user.kind === "staff" &&
      !canAccessRole(session.user.role, operationalRoles)
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const customerProfile =
      session.user.kind === "customer"
        ? await getCustomerProfile(session.user.id)
        : null;

    if (
      session.user.kind === "customer" &&
      (!customerProfile || !isValidCustomerPhone(customerProfile.phone))
    ) {
      return NextResponse.json(
        { error: "Add a valid phone number before placing your order." },
        { status: 409 },
      );
    }

    if (session.user.kind === "customer" && !process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json(
        { error: "Online payment is temporarily unavailable." },
        { status: 503 },
      );
    }

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

    const linkedStaffCustomer =
      session.user.kind === "staff" && parsed.data.customerId
        ? await getStaffVisibleCustomer(parsed.data.customerId, tenantContext)
        : null;

    if (
      session.user.kind === "staff" &&
      parsed.data.customerId &&
      !linkedStaffCustomer
    ) {
      return NextResponse.json(
        { error: "Customer is not available for this restaurant." },
        { status: 403 },
      );
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
    const currency = await getTenantMenuCurrency(tenantContext);
    const paymentPricing =
      session.user.kind === "customer"
        ? buildOrderPaymentPricing(cartItems, currency)
        : null;
    const paymentExpiresAt = paymentPricing
      ? new Date(Date.now() + 30 * 60 * 1000)
      : null;
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
          customerId:
            session.user.kind === "customer"
              ? session.user.id
              : linkedStaffCustomer?.id ?? null,
          createdByUserId: session.user.kind === "staff" ? session.user.id : null,
          source:
            session.user.kind === "staff" ? "STAFF_CREATED" : "CUSTOMER_SELF_SERVICE",
          paymentStatus: paymentPricing ? "PENDING" : "NOT_REQUIRED",
          paymentAmount: paymentPricing?.amountTotal ?? null,
          paymentCurrency: paymentPricing?.currency ?? null,
          paymentExpiresAt,
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

    let checkoutUrl: string | null = null;

    if (paymentPricing && paymentExpiresAt && customerProfile) {
      let checkoutSessionId: string | null = null;

      try {
        const checkoutSession = await createOrderCheckoutSession({
          customerEmail: customerProfile.email,
          customerId: customerProfile.id,
          expiresAt: paymentExpiresAt,
          lineItems: paymentPricing.lineItems,
          orderId: createdOrder.id,
          origin: new URL(request.url).origin,
        });
        checkoutSessionId = checkoutSession.id;
        checkoutUrl = checkoutSession.url;

        const [updatedOrder] = await db
          .update(orders)
          .set({
            stripeCheckoutSessionId: checkoutSession.id,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(orders.id, createdOrder.id),
              eq(orders.paymentStatus, "PENDING"),
            ),
          )
          .returning({ id: orders.id });

        if (!updatedOrder) {
          throw new Error("Payment session could not be linked to the order.");
        }
      } catch (paymentError) {
        if (checkoutSessionId) {
          await getStripe().checkout.sessions.expire(checkoutSessionId).catch(() => null);
        }

        await cancelPendingOrderPaymentByOrderId(createdOrder.id, "FAILED").catch(
          () => null,
        );
        logError("order.checkout.create_failed", paymentError, {
          orderId: createdOrder.id,
          organizationId: tenantContext.organizationId,
          locationId: tenantContext.locationId,
        });
        throw new Error("Payment could not be started. Please try again.");
      }
    }

    return NextResponse.json({
      ...serializeOrder(createdOrder, cartItems),
      checkoutUrl,
      currency,
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
