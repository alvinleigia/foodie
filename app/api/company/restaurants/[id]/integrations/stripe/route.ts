import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { requireRole } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit-log";
import { getCompanyRestaurantHref } from "@/lib/company-workspace";
import {
  PaymentIntegrationConfigurationError,
  startOrganizationStripeOnboarding,
  syncOrganizationStripeAccount,
  updateOrganizationPaymentSettings,
} from "@/lib/organization-payment-settings";
import { companyAdminRoles } from "@/lib/role-access";
import { getCompanyRestaurant, getPlatformCompany } from "@/lib/saas-admin";
import {
  organizationPaymentActionSchema,
  organizationPaymentSettingsSchema,
} from "@/lib/validations/organization-integrations";
import {
  assertOrganizationFeatureEnabled,
  FeatureEntitlementError,
} from "@/lib/feature-entitlements";

async function getAuthorizedRestaurant(id: string) {
  const session = await requireRole([...companyAdminRoles]);

  if (!session?.user.organizationId || !session.user.email) {
    return null;
  }

  const [company, restaurant] = await Promise.all([
    getPlatformCompany(session.user.organizationId),
    getCompanyRestaurant(session.user.organizationId, id),
  ]);

  return company && restaurant ? { company, restaurant, session } : null;
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
    const settings = organizationPaymentSettingsSchema.parse(await request.json());

    if (settings.mode !== "DISABLED") {
      await assertOrganizationFeatureEnabled(
        authorized.restaurant.id,
        "payments.stripe",
      );
    }

    const snapshot = await updateOrganizationPaymentSettings(
      authorized.restaurant.id,
      settings,
      authorized.session.user.id,
    );

    await writeAuditLog({
      actor: authorized.session.user,
      organizationId: snapshot.organization.id,
      action: "company.restaurant.payment_integration.update",
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

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const authorized = await getAuthorizedRestaurant(id);

  if (!authorized) {
    return NextResponse.json({ error: "Restaurant not found." }, { status: 404 });
  }

  try {
    const { action } = organizationPaymentActionSchema.parse(await request.json());

    if (action === "SYNC") {
      const snapshot = await syncOrganizationStripeAccount(authorized.restaurant.id);
      await writeAuditLog({
        actor: authorized.session.user,
        organizationId: snapshot.organization.id,
        action: "company.restaurant.payment_integration.sync",
        entityType: "organization_payment_account",
        entityId: snapshot.organization.id,
        metadata: { onboardingStatus: snapshot.settings.onboardingStatus },
      });
      return NextResponse.json({ snapshot });
    }

    await assertOrganizationFeatureEnabled(
      authorized.restaurant.id,
      "payments.stripe",
    );

    const onboarding = await startOrganizationStripeOnboarding({
      organizationId: authorized.restaurant.id,
      contactEmail: authorized.session.user.email!,
      origin: new URL(request.url).origin,
      returnPath: `/api/company/restaurants/${authorized.restaurant.id}/integrations/stripe/return`,
      refreshPath: `${getCompanyRestaurantHref(
        authorized.company.slug,
        authorized.restaurant.slug,
        "integrations",
      )}?stripe=refresh`,
      updatedByUserId: authorized.session.user.id,
    });
    await writeAuditLog({
      actor: authorized.session.user,
      organizationId: authorized.restaurant.id,
      action: "company.restaurant.payment_integration.onboarding_start",
      entityType: "organization_payment_account",
      entityId: authorized.restaurant.id,
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
