import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { requireStaffPermission } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit-log";
import {
  getStaffJobConfiguration,
  saveStaffJob,
  StaffJobConflictError,
} from "@/lib/staff-jobs";
import { getCurrentTenantContext } from "@/lib/tenant-context";

export async function GET() {
  const session = await requireStaffPermission("staff.manage");

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const context = await getCurrentTenantContext();
  return NextResponse.json(await getStaffJobConfiguration(context));
}

export async function POST(request: Request) {
  const session = await requireStaffPermission("staff.manage");

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const context = await getCurrentTenantContext();
    const result = await saveStaffJob(await request.json(), { context });
    const created = result.configuration.jobs.find(
      (job) => job.id === result.savedJobId,
    );

    await writeAuditLog({
      actor: session.user,
      organizationId: context.organizationId,
      action: "restaurant.staff_job.create",
      entityType: "staff_job",
      entityId: created?.id ?? null,
      metadata: {
        name: created?.name ?? null,
        permissions: created?.permissions ?? [],
      },
    });

    return NextResponse.json(result.configuration, { status: 201 });
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
          error instanceof Error ? error.message : "Failed to create staff job.",
      },
      { status: 500 },
    );
  }
}
