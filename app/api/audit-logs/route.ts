import { NextRequest, NextResponse } from "next/server";

import { requireStaffPermission } from "@/lib/auth";
import { listAuditLogsForViewer } from "@/lib/audit-log";

export async function GET(request: NextRequest) {
  const session = await requireStaffPermission("audit.view");

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = Number(request.nextUrl.searchParams.get("limit") ?? "100");
  const logs = await listAuditLogsForViewer(
    {
      role: session.user.role,
      organizationId: session.user.organizationId,
    },
    Number.isFinite(limit) ? limit : 100,
  );

  return NextResponse.json({ logs });
}
