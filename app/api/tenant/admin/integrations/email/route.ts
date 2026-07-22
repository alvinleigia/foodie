import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { requireStaffPermission } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit-log";
import {
  EmailIntegrationConfigurationError,
  testOrganizationEmailSettings,
  updateOrganizationEmailSettings,
} from "@/lib/organization-email-settings";
import { getCurrentTenantContext } from "@/lib/tenant-context";

async function getRestaurantSessionAndContext() {
  const session = await requireStaffPermission("integrations.manage");

  if (!session?.user.email) {
    return null;
  }

  const tenantContext = await getCurrentTenantContext();
  return { session, tenantContext };
}

export async function PATCH(request: Request) {
  const authorized = await getRestaurantSessionAndContext();

  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const snapshot = await updateOrganizationEmailSettings(
      authorized.tenantContext.organizationId,
      await request.json(),
      authorized.session.user.id,
    );

    await writeAuditLog({
      actor: authorized.session.user,
      organizationId: snapshot.organization.id,
      action: "restaurant.email_integration.update",
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
  const authorized = await getRestaurantSessionAndContext();

  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const snapshot = await testOrganizationEmailSettings(
      authorized.tenantContext.organizationId,
      authorized.session.user.email!,
    );

    await writeAuditLog({
      actor: authorized.session.user,
      organizationId: snapshot.organization.id,
      action: "restaurant.email_integration.test",
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
