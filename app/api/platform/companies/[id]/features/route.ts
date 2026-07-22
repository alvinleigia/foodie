import { NextResponse } from "next/server";
import { ZodError, z } from "zod";

import { requireRole } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit-log";
import {
  FeatureEntitlementError,
  listOrganizationFeatureEntitlements,
  updateOrganizationFeatureOverrides,
} from "@/lib/feature-entitlements";
import { platformAdminRoles } from "@/lib/role-access";
import {
  getCompanyRestaurant,
  getPlatformCompany,
} from "@/lib/saas-admin";
import { featureOverrideBatchSchema } from "@/lib/validations/feature-entitlements";

const organizationIdSchema = z.uuid();

async function getFeatureTarget(
  companyOrganizationId: string,
  targetOrganizationId: string,
) {
  if (targetOrganizationId === companyOrganizationId) {
    return getPlatformCompany(companyOrganizationId);
  }

  return getCompanyRestaurant(companyOrganizationId, targetOrganizationId);
}

export async function GET(
  request: Request,
  props: { params: Promise<{ id: string }> },
) {
  const session = await requireRole([...platformAdminRoles]);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await props.params;
  const parsedOrganizationId = organizationIdSchema.safeParse(
    new URL(request.url).searchParams.get("organizationId") ?? id,
  );

  if (!parsedOrganizationId.success) {
    return NextResponse.json(
      { error: "Invalid feature scope." },
      { status: 400 },
    );
  }

  const target = await getFeatureTarget(id, parsedOrganizationId.data);

  if (!target) {
    return NextResponse.json(
      { error: "Company or restaurant not found." },
      { status: 404 },
    );
  }

  return NextResponse.json({
    entitlements: await listOrganizationFeatureEntitlements(target.id),
  });
}

export async function PATCH(
  request: Request,
  props: { params: Promise<{ id: string }> },
) {
  const session = await requireRole([...platformAdminRoles]);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await props.params;
    const parsed = featureOverrideBatchSchema.parse(await request.json());
    const target = await getFeatureTarget(id, parsed.organizationId);

    if (!target) {
      return NextResponse.json(
        { error: "Company or restaurant not found." },
        { status: 404 },
      );
    }

    const entitlements = await updateOrganizationFeatureOverrides(
      target.id,
      parsed.updates,
      session.user.id ?? null,
    );

    await writeAuditLog({
      actor: session.user,
      organizationId: target.id,
      action: "platform.feature_overrides.update",
      entityType: "organization_feature_override",
      entityId: target.id,
      metadata: {
        companyOrganizationId: id,
        targetOrganizationId: target.id,
        updates: parsed.updates.map((update) => ({
          expiresAt: update.expiresAt?.toISOString() ?? null,
          featureKey: update.featureKey,
          mode: update.mode,
          reason: update.reason,
        })),
      },
    });

    return NextResponse.json({ entitlements });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
    }

    if (error instanceof FeatureEntitlementError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Feature overrides could not be updated.",
      },
      { status: 500 },
    );
  }
}
