import { NextRequest, NextResponse } from "next/server";
import { generateCustomerToken } from "@/lib/order-token";
import { getNextOrderNumber } from "@/lib/order-number";
import { createOrderSchema } from "@/lib/validations/order";
import { getMixologistOrders, serializeOrder } from "@/lib/orders";
import { getOrdersResetAt } from "@/lib/order-reset";
import { getMenuSelectionSnapshot } from "@/lib/menu";
import { getDb } from "@/db";
import { orders } from "@/db/schema";
import { requireMixologistSession } from "@/lib/auth";

export async function GET() {
  try {
    const session = await requireMixologistSession();

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { activeOrders, pastOrders } = await getMixologistOrders();
    return NextResponse.json({
      activeOrders: activeOrders.map(serializeOrder),
      pastOrders: pastOrders.map(serializeOrder),
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
    const body = await request.json();
    const parsed = createOrderSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const { category, item } = await getMenuSelectionSnapshot(
      parsed.data.categoryId,
      parsed.data.drinkId,
    );

    if (!category || !item) {
      return NextResponse.json({ error: "Invalid drink selection." }, { status: 400 });
    }

    const db = getDb();
    const customerToken = generateCustomerToken();
    const orderNo = await getNextOrderNumber();

    const [createdOrder] = await db
      .insert(orders)
      .values({
        orderNo,
        customerName: parsed.data.customerName.trim(),
        customerToken,
        categoryId: category.id,
        categoryName: category.name,
        drinkId: item.id,
        drinkName: item.name,
      })
      .returning()
      ;

    return NextResponse.json({
      ...serializeOrder(createdOrder),
      ordersResetAt: await getOrdersResetAt(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create order." },
      { status: 500 },
    );
  }
}
