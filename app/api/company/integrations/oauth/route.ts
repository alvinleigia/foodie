import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { requireRole } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit-log";
import {
  OAuthIntegrationConfigurationError,
  updateOrganizationOAuthSettings,
} from "@/lib/organization-oauth-settings";
import { companyAdminRoles } from "@/lib/role-access";

export async function PATCH(request: Request) {
  const session = await requireRole([...companyAdminRoles]);

  if (!session?.user.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const snapshot = await updateOrganizationOAuthSettings(
      session.user.organizationId,
      await request.json(),
      session.user.id,
    );

    await writeAuditLog({
      actor: session.user,
      organizationId: snapshot.organization.id,
      action: "company.oauth_integration.update",
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
