import { NextResponse } from "next/server";

import { requireStaffPermission } from "@/lib/auth";
import { syncOrganizationStripeAccount } from "@/lib/organization-payment-settings";
import { getRestaurantWorkspaceHref } from "@/lib/restaurant-workspace";
import { getCurrentStaffRestaurantAccess } from "@/lib/tenant-context";

export async function GET(request: Request) {
  const session = await requireStaffPermission("integrations.manage");

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
