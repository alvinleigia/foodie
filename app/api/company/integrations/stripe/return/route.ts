import { NextResponse } from "next/server";

import { requireRole } from "@/lib/auth";
import { syncOrganizationStripeAccount } from "@/lib/organization-payment-settings";
import { companyAdminRoles } from "@/lib/role-access";

export async function GET(request: Request) {
  const session = await requireRole([...companyAdminRoles]);

  if (!session?.user.organizationId) {
    return NextResponse.redirect(new URL("/staff/login", request.url));
  }

  await syncOrganizationStripeAccount(session.user.organizationId).catch(() => null);
  return NextResponse.redirect(new URL("/company/integrations?stripe=connected", request.url));
}
