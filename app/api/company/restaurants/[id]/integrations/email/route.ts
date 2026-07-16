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
import { getCompanyRestaurant } from "@/lib/saas-admin";

async function getAuthorizedRestaurant(id: string) {
  const session = await requireRole([...companyAdminRoles]);

  if (!session?.user.organizationId || !session.user.email) {
    return null;
  }

  const restaurant = await getCompanyRestaurant(session.user.organizationId, id);
  return restaurant ? { restaurant, session } : null;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const authorized = await getAuthorizedRestaurant(id);

  if (!authorized) {
    return NextResponse.json({ error: "Restaurant not found." }, { status: 404 });
  }

  try {
    const snapshot = await updateOrganizationEmailSettings(
      authorized.restaurant.id,
      await request.json(),
      authorized.session.user.id,
    );

    await writeAuditLog({
      actor: authorized.session.user,
      organizationId: snapshot.organization.id,
      action: "company.restaurant.email_integration.update",
      entityType: "organization_email_settings",
      entityId: snapshot.organization.id,
      metadata: {
        companyOrganizationId: authorized.session.user.organizationId,
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

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const authorized = await getAuthorizedRestaurant(id);

  if (!authorized) {
    return NextResponse.json({ error: "Restaurant not found." }, { status: 404 });
  }

  try {
    const snapshot = await testOrganizationEmailSettings(
      authorized.restaurant.id,
      authorized.session.user.email!,
    );

    await writeAuditLog({
      actor: authorized.session.user,
      organizationId: snapshot.organization.id,
      action: "company.restaurant.email_integration.test",
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
