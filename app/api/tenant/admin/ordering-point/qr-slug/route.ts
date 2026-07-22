import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";

import { requireStaffPermission } from "@/lib/auth";
import { checkOrderingPointQrSlugAvailability } from "@/lib/tenant-admin";
import { getCurrentTenantContext } from "@/lib/tenant-context";

export async function GET(request: NextRequest) {
  try {
    const session = await requireStaffPermission("ordering_point.manage");

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantContext = await getCurrentTenantContext();
    const qrSlug = request.nextUrl.searchParams.get("value") ?? "";
    const result = await checkOrderingPointQrSlugAvailability(tenantContext, qrSlug);

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to check QR slug." },
      { status: 500 },
    );
  }
}
