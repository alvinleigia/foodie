import { NextResponse } from "next/server";

import { requireRole } from "@/lib/auth";
import { getCompanyWorkspaceHref } from "@/lib/company-workspace";
import { syncOrganizationStripeAccount } from "@/lib/organization-payment-settings";
import { companyAdminRoles } from "@/lib/role-access";
import { getPlatformCompany } from "@/lib/saas-admin";

export async function GET(request: Request) {
  const session = await requireRole([...companyAdminRoles]);

  if (!session?.user.organizationId) {
    return NextResponse.redirect(new URL("/staff/login", request.url));
  }

  const company = await getPlatformCompany(session.user.organizationId);

  if (!company) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  await syncOrganizationStripeAccount(company.id).catch(() => null);
  return NextResponse.redirect(
    new URL(
      `${getCompanyWorkspaceHref(company.slug, "integrations")}?stripe=connected`,
      request.url,
    ),
  );
}
