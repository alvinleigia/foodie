import { NextResponse } from "next/server";

import { requireMixologistSession } from "@/lib/auth";
import { exportMenuCsv } from "@/lib/menu";

export async function GET() {
  try {
    const session = await requireMixologistSession();

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const csv = await exportMenuCsv();

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="mixologist-menu-export.csv"',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to export menu." },
      { status: 500 },
    );
  }
}
