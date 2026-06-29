import { NextRequest, NextResponse } from "next/server";

import { requireRole } from "@/lib/auth";
import { listAuditLogsForViewer } from "@/lib/audit-log";
import { restaurantAdminRoles } from "@/lib/role-access";

export async function GET(request: NextRequest) {
  const session = await requireRole([...restaurantAdminRoles]);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = Number(request.nextUrl.searchParams.get("limit") ?? "100");
  const logs = await listAuditLogsForViewer(
    {
      role: session.user.role,
      organizationId: session.user.organizationId,
      locationId: session.user.locationId,
    },
    Number.isFinite(limit) ? limit : 100,
  );

  return NextResponse.json({ logs });
}
