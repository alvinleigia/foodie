import { NextResponse } from "next/server";

import { requireMixologistSession } from "@/lib/auth";
import { getAdminMenu } from "@/lib/menu";

export async function GET() {
  try {
    const session = await requireMixologistSession();

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const categories = await getAdminMenu();
    return NextResponse.json({ categories });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch admin menu." },
      { status: 500 },
    );
  }
}
