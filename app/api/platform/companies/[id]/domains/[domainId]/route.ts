import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { requireRole } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit-log";
import { FeatureEntitlementError } from "@/lib/feature-entitlements";
import { platformAdminRoles } from "@/lib/role-access";
import {
  listCompanyDomains,
  updateCompanyDomain,
} from "@/lib/saas-admin";

export async function PATCH(
  request: Request,
  props: { params: Promise<{ id: string; domainId: string }> },
) {
  const session = await requireRole([...platformAdminRoles]);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id, domainId } = await props.params;
    const domain = await updateCompanyDomain(id, domainId, await request.json());

    if (!domain) {
      return NextResponse.json({ error: "Domain not found." }, { status: 404 });
    }

    await writeAuditLog({
      actor: session.user,
      organizationId: id,
      action: "platform.company_domain.update",
      entityType: "tenant_domain",
      entityId: domain.id,
      metadata: {
        domain: domain.domain,
        purpose: domain.purpose,
        isPrimary: domain.isPrimary,
        isActive: domain.isActive,
      },
    });

    return NextResponse.json({ domains: await listCompanyDomains(id) });
  } catch (error) {
    if (error instanceof FeatureEntitlementError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update domain." },
      { status: 500 },
    );
  }
}
