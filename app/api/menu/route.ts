import { NextResponse } from "next/server";

import { getPublicMenu } from "@/lib/menu";

export async function GET() {
  try {
    const categories = await getPublicMenu();
    return NextResponse.json({ categories });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch menu." },
      { status: 500 },
    );
  }
}
