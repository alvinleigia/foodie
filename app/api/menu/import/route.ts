import { NextRequest, NextResponse } from "next/server";

import { requireMixologistSession } from "@/lib/auth";
import { importMenuCsv } from "@/lib/menu";
import { z } from "zod";

const importMenuSchema = z.object({
  csv: z.string().min(1, "CSV content is required"),
});

export async function POST(request: NextRequest) {
  try {
    const session = await requireMixologistSession();

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = importMenuSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const result = await importMenuCsv(parsed.data.csv);

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to import menu." },
      { status: 500 },
    );
  }
}
