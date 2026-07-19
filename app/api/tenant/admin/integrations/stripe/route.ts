import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { requireRole } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit-log";
import {
  PaymentIntegrationConfigurationError,
  startOrganizationStripeOnboarding,
  syncOrganizationStripeAccount,
  updateOrganizationPaymentSettings,
} from "@/lib/organization-payment-settings";
import { restaurantAdminRoles } from "@/lib/role-access";
import { getRestaurantWorkspaceHref } from "@/lib/restaurant-workspace";
import { getCurrentStaffRestaurantAccess } from "@/lib/tenant-context";
import {
  organizationPaymentActionSchema,
  organizationPaymentSettingsSchema,
} from "@/lib/validations/organization-integrations";
import {
  assertOrganizationFeatureEnabled,
  FeatureEntitlementError,
} from "@/lib/feature-entitlements";

async function getRestaurantSessionAndContext() {
  const session = await requireRole([...restaurantAdminRoles]);

  if (!session?.user.email) {
    return null;
  }

  const access = await getCurrentStaffRestaurantAccess();

  if (!access) {
    return null;
  }

  return { access, session, tenantContext: access.tenantContext };
}

export async function PATCH(request: Request) {
  const authorized = await getRestaurantSessionAndContext();

  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const settings = organizationPaymentSettingsSchema.parse(await request.json());

    if (settings.mode !== "DISABLED") {
      await assertOrganizationFeatureEnabled(
        authorized.tenantContext.organizationId,
        "payments.stripe",
      );
    }

    const snapshot = await updateOrganizationPaymentSettings(
      authorized.tenantContext.organizationId,
      settings,
      authorized.session.user.id,
    );

    await writeAuditLog({
      actor: authorized.session.user,
      organizationId: snapshot.organization.id,
      action: "restaurant.payment_integration.update",
      entityType: "organization_payment_account",
      entityId: snapshot.organization.id,
      metadata: { mode: snapshot.settings.mode, provider: snapshot.settings.provider },
    });

    return NextResponse.json({ snapshot });
  } catch (error) {
    if (error instanceof FeatureEntitlementError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Payment settings could not be saved." },
      { status: error instanceof PaymentIntegrationConfigurationError ? 409 : 500 },
    );
  }
}

export async function POST(request: Request) {
  const authorized = await getRestaurantSessionAndContext();

  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { action } = organizationPaymentActionSchema.parse(await request.json());

    if (action === "SYNC") {
      const snapshot = await syncOrganizationStripeAccount(
        authorized.tenantContext.organizationId,
      );
      await writeAuditLog({
        actor: authorized.session.user,
        organizationId: snapshot.organization.id,
        action: "restaurant.payment_integration.sync",
        entityType: "organization_payment_account",
        entityId: snapshot.organization.id,
        metadata: { onboardingStatus: snapshot.settings.onboardingStatus },
      });
      return NextResponse.json({ snapshot });
    }

    await assertOrganizationFeatureEnabled(
      authorized.tenantContext.organizationId,
      "payments.stripe",
    );

    const onboarding = await startOrganizationStripeOnboarding({
        organizationId: authorized.tenantContext.organizationId,
        contactEmail: authorized.session.user.email!,
        origin: new URL(request.url).origin,
        returnPath: "/api/tenant/admin/integrations/stripe/return",
        refreshPath: `${getRestaurantWorkspaceHref(
          authorized.access.restaurant.slug,
          "integrations",
        )}?stripe=refresh`,
        updatedByUserId: authorized.session.user.id,
      });
    await writeAuditLog({
      actor: authorized.session.user,
      organizationId: authorized.tenantContext.organizationId,
      action: "restaurant.payment_integration.onboarding_start",
      entityType: "organization_payment_account",
      entityId: authorized.tenantContext.organizationId,
    });
    return NextResponse.json(onboarding);
  } catch (error) {
    if (error instanceof FeatureEntitlementError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Stripe could not be connected." },
      { status: error instanceof PaymentIntegrationConfigurationError ? 409 : 502 },
    );
  }
}
