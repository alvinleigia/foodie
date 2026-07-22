import { NextResponse } from "next/server";

import { requireRole } from "@/lib/auth";
import { getOperationalAlertStatus } from "@/lib/operational-alerts";
import { platformAdminRoles } from "@/lib/role-access";

export async function GET() {
  const session = await requireRole(platformAdminRoles);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(getOperationalAlertStatus());
}
