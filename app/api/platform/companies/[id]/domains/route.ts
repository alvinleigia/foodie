import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { requireRole } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit-log";
import { platformAdminRoles } from "@/lib/role-access";
import {
  createCompanyDomain,
  listCompanyDomains,
} from "@/lib/saas-admin";

export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  const session = await requireRole([...platformAdminRoles]);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await props.params;
  const domains = await listCompanyDomains(id);

  if (!domains) {
    return NextResponse.json({ error: "Company not found." }, { status: 404 });
  }

  return NextResponse.json({ domains });
}

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const session = await requireRole([...platformAdminRoles]);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await props.params;
    const domain = await createCompanyDomain(id, await request.json());

    if (!domain) {
      return NextResponse.json({ error: "Company not found." }, { status: 404 });
    }

    await writeAuditLog({
      actor: session.user,
      organizationId: id,
      action: "platform.company_domain.create",
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
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to add domain." },
      { status: 500 },
    );
  }
}
