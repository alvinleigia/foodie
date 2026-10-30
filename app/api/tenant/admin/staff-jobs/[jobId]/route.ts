import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { requireStaffPermission } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit-log";
import {
  getStaffJobAssignment,
  saveStaffJob,
  StaffJobConflictError,
} from "@/lib/staff-jobs";
import { getCurrentTenantContext } from "@/lib/tenant-context";
import { staffJobSchema } from "@/lib/validations/staff-job";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  const session = await requireStaffPermission("staff.manage");

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const tenantContext = await getCurrentTenantContext();
    const { jobId } = await context.params;
    const input = staffJobSchema.parse(await request.json());

    if (!input.permissions.includes("staff.manage")) {
      const ownAssignment = await getStaffJobAssignment(
        session.user.membershipId,
        tenantContext,
      );

      if (ownAssignment.primaryJobId === jobId) {
        return NextResponse.json(
          { error: "Your primary job must keep staff management access." },
          { status: 400 },
        );
      }
    }

    const result = await saveStaffJob(input, {
      context: tenantContext,
      jobId,
    });
    const updated = result.configuration.jobs.find((job) => job.id === jobId);

    await writeAuditLog({
      actor: session.user,
      organizationId: tenantContext.organizationId,
      action: "restaurant.staff_job.update",
      entityType: "staff_job",
      entityId: jobId,
      metadata: {
        isActive: updated?.isActive ?? input.isActive,
        name: updated?.name ?? input.name,
        permissions: updated?.permissions ?? input.permissions,
      },
    });

    return NextResponse.json(result.configuration);
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
          error instanceof Error ? error.message : "Failed to update staff job.",
      },
      { status: 500 },
    );
  }
}
