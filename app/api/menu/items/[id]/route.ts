import { NextRequest, NextResponse } from "next/server";

import { requireMixologistSession } from "@/lib/auth";
import { getAdminMenu, updateMenuItem } from "@/lib/menu";
import { menuItemSchema } from "@/lib/validations/menu";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireMixologistSession();

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const body = await request.json();
    const parsed = menuItemSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const item = await updateMenuItem(id, parsed.data);

    if (!item) {
      return NextResponse.json({ error: "Item not found." }, { status: 404 });
    }

    return NextResponse.json({ categories: await getAdminMenu() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update item." },
      { status: 500 },
    );
  }
}
