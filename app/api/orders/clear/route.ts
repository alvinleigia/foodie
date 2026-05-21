import { NextRequest, NextResponse } from "next/server";

import { getDb } from "@/db";
import { orders } from "@/db/schema";
import { requireMixologistSession } from "@/lib/auth";
import { markOrdersReset } from "@/lib/order-reset";

export async function POST(request: NextRequest) {
  try {
    const session = await requireMixologistSession();

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as { confirmationText?: string };
    const confirmationText = body.confirmationText?.trim().toLowerCase();

    if (confirmationText !== "delete") {
      return NextResponse.json(
        { error: 'Type "delete" exactly to clear all order records.' },
        { status: 400 },
      );
    }

    const db = getDb();
    const deletedOrders = await db.delete(orders).returning({ id: orders.id });
    const ordersResetAt = await markOrdersReset();

    return NextResponse.json({
      success: true,
      deletedCount: deletedOrders.length,
      ordersResetAt,
      message: deletedOrders.length
        ? `Cleared ${deletedOrders.length} order records.`
        : "There were no order records to clear.",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to clear orders." },
      { status: 500 },
    );
  }
}
