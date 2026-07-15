import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/auth";
import { getCustomerProfile } from "@/lib/customer-account";
import { getTenantMenuCurrency } from "@/lib/menu";
import {
  getCustomerAccountOrders,
  getCustomerAccountOrdersByIds,
  getOrderItemsForOrders,
  serializeOrder,
} from "@/lib/orders";
import {
  checkRateLimit,
  getRequestRateLimitKey,
  rateLimitResponse,
} from "@/lib/rate-limit";
import { getPublicTenantContextFromRequest } from "@/lib/tenant-context";
import { orderStatusRequestSchema } from "@/lib/validations/order";

export async function POST(request: NextRequest) {
  try {
    const rateLimit = checkRateLimit({
      key: getRequestRateLimitKey(request, "public:order-status"),
      limit: 45,
      windowMs: 60_000,
    });

    if (!rateLimit.allowed) {
      return rateLimitResponse(rateLimit);
    }

    const body = await request.json();
    const parsed = orderStatusRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const tenantContext = await getPublicTenantContextFromRequest(request);
    const [session, currency] = await Promise.all([
      auth().catch(() => null),
      getTenantMenuCurrency(tenantContext),
    ]);

    if (session?.user.kind !== "customer") {
      return NextResponse.json(
        { error: "Customer sign in is required." },
        { status: 401 },
      );
    }

    const customerProfile = await getCustomerProfile(
      session.user.id,
      tenantContext,
    );

    if (!customerProfile) {
      return NextResponse.json({ error: "Customer profile not found." }, { status: 404 });
    }

    const matchingOrders =
      parsed.data.view === "ACTIVE"
        ? await getCustomerAccountOrdersByIds(
            customerProfile.id,
            parsed.data.orders.map((order) => order.orderId),
            tenantContext,
          )
        : await getCustomerAccountOrders(
            customerProfile.id,
            parsed.data.view === "COMPLETED" ? "COMPLETED" : "ALL",
            tenantContext,
          );
    const itemMap = await getOrderItemsForOrders(
      matchingOrders.map((order) => order.id),
      tenantContext,
    );
    return NextResponse.json({
      orders: matchingOrders.map((order) => serializeOrder(order, itemMap.get(order.id) ?? [])),
      currency,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch order statuses." },
      { status: 500 },
    );
  }
}
