import { NextResponse } from "next/server";

import { requireRole } from "@/lib/auth";
import { syncOrganizationStripeAccount } from "@/lib/organization-payment-settings";
import { restaurantAdminRoles } from "@/lib/role-access";
import { getCurrentTenantContext } from "@/lib/tenant-context";

export async function GET(request: Request) {
  const session = await requireRole([...restaurantAdminRoles]);

  if (!session) {
    return NextResponse.redirect(new URL("/staff/login", request.url));
  }

  const tenantContext = await getCurrentTenantContext().catch(() => null);

  if (tenantContext) {
    await syncOrganizationStripeAccount(tenantContext.organizationId).catch(() => null);
  }

  return NextResponse.redirect(new URL("/restaurant/integrations?stripe=connected", request.url));
}
