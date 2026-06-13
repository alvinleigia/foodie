import { NextRequest, NextResponse } from "next/server";

import { requireMixologistSession } from "@/lib/auth";
import { createMenuItem, getAdminMenu } from "@/lib/menu";
import { menuItemSchema } from "@/lib/validations/menu";

export async function POST(request: NextRequest) {
  try {
    const session = await requireMixologistSession();

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = menuItemSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    await createMenuItem(parsed.data);
    return NextResponse.json({ categories: await getAdminMenu() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create item." },
      { status: 500 },
    );
  }
}
