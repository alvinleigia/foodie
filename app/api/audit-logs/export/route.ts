import { NextRequest, NextResponse } from "next/server";

import { requireStaffPermission } from "@/lib/auth";
import { auditLogsToCsv, listAuditLogsForViewer } from "@/lib/audit-log";

export async function GET(request: NextRequest) {
  const session = await requireStaffPermission("audit.view");

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = Number(request.nextUrl.searchParams.get("limit") ?? "250");
  const logs = await listAuditLogsForViewer(
    {
      role: session.user.role,
      organizationId: session.user.organizationId,
    },
    Number.isFinite(limit) ? limit : 250,
  );

  return new Response(auditLogsToCsv(logs), {
    headers: {
      "Content-Disposition": `attachment; filename="audit-logs.csv"`,
      "Content-Type": "text/csv; charset=utf-8",
    },
  });
}
