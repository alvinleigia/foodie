import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { requireRole } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit-log";
import {
  EmailIntegrationConfigurationError,
  testOrganizationEmailSettings,
  updateOrganizationEmailSettings,
} from "@/lib/organization-email-settings";
import { companyAdminRoles } from "@/lib/role-access";

async function getCompanySession() {
  const session = await requireRole([...companyAdminRoles]);
  return session?.user.organizationId && session.user.email ? session : null;
}

export async function PATCH(request: Request) {
  const session = await getCompanySession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const snapshot = await updateOrganizationEmailSettings(
      session.user.organizationId,
      await request.json(),
      session.user.id,
    );

    await writeAuditLog({
      actor: session.user,
      organizationId: snapshot.organization.id,
      action: "company.email_integration.update",
      entityType: "organization_email_settings",
      entityId: snapshot.organization.id,
      metadata: {
        mode: snapshot.settings.mode,
        provider: snapshot.settings.provider,
        verificationStatus: snapshot.settings.verificationStatus,
      },
    });

    return NextResponse.json({ snapshot });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
    }

    const status = error instanceof EmailIntegrationConfigurationError ? 409 : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Email settings could not be saved." },
      { status },
    );
  }
}

export async function POST() {
  const session = await getCompanySession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const snapshot = await testOrganizationEmailSettings(
      session.user.organizationId,
      session.user.email!,
    );

    await writeAuditLog({
      actor: session.user,
      organizationId: snapshot.organization.id,
      action: "company.email_integration.test",
      entityType: "organization_email_settings",
      entityId: snapshot.organization.id,
      metadata: { status: snapshot.effective.status },
    });

    return NextResponse.json({ snapshot });
  } catch (error) {
    const status = error instanceof EmailIntegrationConfigurationError ? 409 : 502;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Test email could not be sent." },
      { status },
    );
  }
}
