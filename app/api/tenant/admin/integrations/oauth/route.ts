import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { requireRole } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit-log";
import {
  OAuthIntegrationConfigurationError,
  updateOrganizationOAuthSettings,
} from "@/lib/organization-oauth-settings";
import { restaurantAdminRoles } from "@/lib/role-access";
import { getCurrentTenantContext } from "@/lib/tenant-context";

export async function PATCH(request: Request) {
  const session = await requireRole([...restaurantAdminRoles]);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const tenantContext = await getCurrentTenantContext();
    const snapshot = await updateOrganizationOAuthSettings(
      tenantContext.organizationId,
      await request.json(),
      session.user.id,
    );

    await writeAuditLog({
      actor: session.user,
      organizationId: snapshot.organization.id,
      action: "restaurant.oauth_integration.update",
      entityType: "organization_oauth_settings",
      entityId: snapshot.organization.id,
      metadata: {
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
