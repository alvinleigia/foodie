import { NextResponse } from "next/server";

import { requireRole } from "@/lib/auth";
import { syncOrganizationStripeAccount } from "@/lib/organization-payment-settings";
import { companyAdminRoles } from "@/lib/role-access";
import { getCompanyRestaurant } from "@/lib/saas-admin";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requireRole([...companyAdminRoles]);
  const { id } = await context.params;

  if (!session?.user.organizationId) {
    return NextResponse.redirect(new URL("/staff/login", request.url));
  }

  const restaurant = await getCompanyRestaurant(session.user.organizationId, id);

  if (!restaurant) {
    return NextResponse.redirect(new URL("/company/restaurants", request.url));
  }

  await syncOrganizationStripeAccount(restaurant.id).catch(() => null);
  return NextResponse.redirect(
    new URL(`/company/restaurants/${restaurant.id}/integrations?stripe=connected`, request.url),
  );
}
