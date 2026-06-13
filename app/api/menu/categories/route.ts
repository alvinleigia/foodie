import { NextRequest, NextResponse } from "next/server";

import { requireMixologistSession } from "@/lib/auth";
import { createMenuCategory, getAdminMenu } from "@/lib/menu";
import { menuCategorySchema } from "@/lib/validations/menu";

export async function POST(request: NextRequest) {
  try {
    const session = await requireMixologistSession();

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = menuCategorySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    await createMenuCategory(parsed.data);
    return NextResponse.json({ categories: await getAdminMenu() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create category." },
      { status: 500 },
    );
  }
}
