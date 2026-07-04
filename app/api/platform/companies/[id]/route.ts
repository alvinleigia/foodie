import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { requireRole } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit-log";
import { platformAdminRoles } from "@/lib/role-access";
import { listPlatformCompanies, updateOrganizationAdmin } from "@/lib/saas-admin";

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const session = await requireRole([...platformAdminRoles]);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await props.params;
    const company = await updateOrganizationAdmin(id, await request.json(), "COMPANY");

    if (!company) {
      return NextResponse.json({ error: "Company not found." }, { status: 404 });
    }

    await writeAuditLog({
      actor: session.user,
      organizationId: company.id,
      action: "platform.company.update",
      entityType: "organization",
      entityId: company.id,
      metadata: {
        name: company.name,
        slug: company.slug,
        isActive: company.isActive,
      },
    });

    return NextResponse.json({ companies: await listPlatformCompanies() });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update company." },
      { status: 500 },
    );
  }
}
