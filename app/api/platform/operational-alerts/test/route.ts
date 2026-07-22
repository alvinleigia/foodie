import { NextResponse } from "next/server";

import { writeAuditLog } from "@/lib/audit-log";
import { requireRole } from "@/lib/auth";
import {
  OperationalAlertConfigurationError,
  sendOperationalAlertTest,
} from "@/lib/operational-alerts";
import { platformAdminRoles } from "@/lib/role-access";

export async function POST() {
  const session = await requireRole(platformAdminRoles);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await sendOperationalAlertTest();
    await writeAuditLog({
      actor: session.user,
      action: "platform.operational_alert.test",
      entityType: "deployment_cell",
      entityId: process.env.DEPLOYMENT_CELL_ID ?? null,
      metadata: {
        deploymentSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      },
    });

    return NextResponse.json({ sent: true });
  } catch (error) {
    const status =
      error instanceof OperationalAlertConfigurationError ? 409 : 502;

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The operational alert could not be sent.",
      },
      { status },
    );
  }
}
