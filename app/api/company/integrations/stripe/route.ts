import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { requireRole } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit-log";
import { getCompanyWorkspaceHref } from "@/lib/company-workspace";
import {
  PaymentIntegrationConfigurationError,
  startOrganizationStripeOnboarding,
  syncOrganizationStripeAccount,
  updateOrganizationPaymentSettings,
} from "@/lib/organization-payment-settings";
import { companyAdminRoles } from "@/lib/role-access";
import { getPlatformCompany } from "@/lib/saas-admin";
import { organizationPaymentActionSchema } from "@/lib/validations/organization-integrations";

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
    const snapshot = await updateOrganizationPaymentSettings(
      session.user.organizationId,
      await request.json(),
      session.user.id,
    );

    await writeAuditLog({
      actor: session.user,
      organizationId: snapshot.organization.id,
      action: "company.payment_integration.update",
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
  const session = await getCompanySession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { action } = organizationPaymentActionSchema.parse(await request.json());

    if (action === "SYNC") {
      const snapshot = await syncOrganizationStripeAccount(session.user.organizationId);
      await writeAuditLog({
        actor: session.user,
        organizationId: snapshot.organization.id,
        action: "company.payment_integration.sync",
        entityType: "organization_payment_account",
        entityId: snapshot.organization.id,
        metadata: { onboardingStatus: snapshot.settings.onboardingStatus },
      });
      return NextResponse.json({ snapshot });
    }

    const company = await getPlatformCompany(session.user.organizationId);

    if (!company) {
      return NextResponse.json({ error: "Company not found." }, { status: 404 });
    }

    const onboarding = await startOrganizationStripeOnboarding({
      organizationId: session.user.organizationId,
      contactEmail: session.user.email!,
      origin: new URL(request.url).origin,
      returnPath: "/api/company/integrations/stripe/return",
      refreshPath: `${getCompanyWorkspaceHref(company.slug, "integrations")}?stripe=refresh`,
      updatedByUserId: session.user.id,
    });
    await writeAuditLog({
      actor: session.user,
      organizationId: session.user.organizationId,
      action: "company.payment_integration.onboarding_start",
      entityType: "organization_payment_account",
      entityId: session.user.organizationId,
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
