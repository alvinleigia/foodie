import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { requireRole } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit-log";
import {
  OAuthIntegrationConfigurationError,
  updateOrganizationOAuthSettings,
} from "@/lib/organization-oauth-settings";
import { companyAdminRoles } from "@/lib/role-access";
import { getCompanyRestaurant } from "@/lib/saas-admin";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requireRole([...companyAdminRoles]);
  const { id } = await context.params;
  const restaurant = session?.user.organizationId
    ? await getCompanyRestaurant(session.user.organizationId, id)
    : null;

  if (!session?.user.organizationId || !restaurant) {
    return NextResponse.json({ error: "Restaurant not found." }, { status: 404 });
  }

  try {
    const snapshot = await updateOrganizationOAuthSettings(
      restaurant.id,
      await request.json(),
      session.user.id,
    );

    await writeAuditLog({
      actor: session.user,
      organizationId: snapshot.organization.id,
      action: "company.restaurant.oauth_integration.update",
      entityType: "organization_oauth_settings",
      entityId: snapshot.organization.id,
      metadata: {
        companyOrganizationId: session.user.organizationId,
        mode: snapshot.settings.mode,
        provider: snapshot.settings.provider,
      },
    });

    return NextResponse.json({ snapshot });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
    }

    const status = error instanceof OAuthIntegrationConfigurationError ? 409 : 500;
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Social login settings could not be saved.",
      },
      { status },
    );
  }
}
