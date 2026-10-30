import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { requireStaffPermission } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit-log";
import { resolveStaffPermissions } from "@/lib/staff-permissions";
import {
  getStaffJobConfiguration,
  replaceStaffJobAssignments,
  StaffJobConflictError,
} from "@/lib/staff-jobs";
import { getCurrentTenantContext } from "@/lib/tenant-context";
import { staffJobAssignmentSchema } from "@/lib/validations/staff-job";

export async function PUT(
  request: Request,
  context: { params: Promise<{ membershipId: string }> },
) {
  const session = await requireStaffPermission("staff.manage");

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const tenantContext = await getCurrentTenantContext();
    const { membershipId } = await context.params;
    const input = staffJobAssignmentSchema.parse(await request.json());

    if (membershipId === session.user.membershipId) {
      const configuration = await getStaffJobConfiguration(tenantContext);
      const primaryJob = configuration.jobs.find(
        (job) => job.id === input.primaryJobId,
      );
      const proposedBaseline = primaryJob?.permissions ?? null;
      const retainsStaffManagement = resolveStaffPermissions(
        session.user.role,
        null,
        proposedBaseline,
      ).includes("staff.manage");

      if (!retainsStaffManagement) {
        return NextResponse.json(
          { error: "You cannot remove your own staff management access." },
          { status: 400 },
        );
      }
    }

    const assignment = await replaceStaffJobAssignments(
      membershipId,
      input,
      tenantContext,
    );

    await writeAuditLog({
      actor: session.user,
      organizationId: tenantContext.organizationId,
      action: "restaurant.staff_job.assign",
      entityType: "membership",
      entityId: membershipId,
      metadata: assignment,
    });

    return NextResponse.json({ assignment });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
    }

    if (error instanceof StaffJobConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to update staff jobs.",
      },
      { status: 500 },
    );
  }
}
