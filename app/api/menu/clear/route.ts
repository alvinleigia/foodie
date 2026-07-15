import { NextRequest, NextResponse } from "next/server";

import { requireMenuManagerSession } from "@/lib/auth";
import { clearMenu, getAdminMenu } from "@/lib/menu";
import { getCurrentTenantContext } from "@/lib/tenant-context";

export async function POST(request: NextRequest) {
  try {
    const session = await requireMenuManagerSession();

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as { confirmationText?: string };
    const confirmationText = body.confirmationText?.trim().toLowerCase();

    if (confirmationText !== "delete") {
      return NextResponse.json(
        { error: 'Type "delete" exactly to clear the current menu.' },
        { status: 400 },
      );
    }

    const tenantContext = await getCurrentTenantContext();
    const summary = await clearMenu(tenantContext);

    return NextResponse.json({
      categories: await getAdminMenu(tenantContext),
      summary,
      message:
        summary.deletedCategories || summary.deletedItems
          ? `Cleared ${summary.deletedCategories} categories and ${summary.deletedItems} products from this restaurant.`
          : "There were no menu records to clear for this restaurant.",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to clear menu." },
      { status: 500 },
    );
  }
}
