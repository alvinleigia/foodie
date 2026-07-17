import { NextResponse } from "next/server";

import { requireRole } from "@/lib/auth";
import { syncOrganizationStripeAccount } from "@/lib/organization-payment-settings";
import { restaurantAdminRoles } from "@/lib/role-access";
import { getRestaurantWorkspaceHref } from "@/lib/restaurant-workspace";
import { getCurrentStaffRestaurantAccess } from "@/lib/tenant-context";

export async function GET(request: Request) {
  const session = await requireRole([...restaurantAdminRoles]);

  if (!session) {
    return NextResponse.redirect(new URL("/staff/login", request.url));
  }

  const access = await getCurrentStaffRestaurantAccess().catch(() => null);

  if (!access) {
    return NextResponse.redirect(new URL("/staff/login", request.url));
  }

  await syncOrganizationStripeAccount(access.tenantContext.organizationId).catch(
    () => null,
  );

  return NextResponse.redirect(
    new URL(
      `${getRestaurantWorkspaceHref(
        access.restaurant.slug,
        "integrations",
      )}?stripe=connected`,
      request.url,
    ),
  );
}
