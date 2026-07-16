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
import { getCurrentTenantContext } from "@/lib/tenant-context";
import { organizationPaymentActionSchema } from "@/lib/validations/organization-integrations";

async function getRestaurantSessionAndContext() {
  const session = await requireRole([...restaurantAdminRoles]);

  if (!session?.user.email) {
    return null;
  }

  return { session, tenantContext: await getCurrentTenantContext() };
}

export async function PATCH(request: Request) {
  const authorized = await getRestaurantSessionAndContext();

  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const snapshot = await updateOrganizationPaymentSettings(
      authorized.tenantContext.organizationId,
      await request.json(),
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

    const onboarding = await startOrganizationStripeOnboarding({
        organizationId: authorized.tenantContext.organizationId,
        contactEmail: authorized.session.user.email!,
        origin: new URL(request.url).origin,
        returnPath: "/api/tenant/admin/integrations/stripe/return",
        refreshPath: "/restaurant/integrations?stripe=refresh",
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
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Stripe could not be connected." },
      { status: error instanceof PaymentIntegrationConfigurationError ? 409 : 502 },
    );
  }
}
