import { NextResponse } from "next/server";

import { requireRole } from "@/lib/auth";
import {
  getCompanyRestaurantHref,
} from "@/lib/company-workspace";
import { syncOrganizationStripeAccount } from "@/lib/organization-payment-settings";
import { companyAdminRoles } from "@/lib/role-access";
import { getCompanyRestaurant, getPlatformCompany } from "@/lib/saas-admin";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requireRole([...companyAdminRoles]);
  const { id } = await context.params;

  if (!session?.user.organizationId) {
    return NextResponse.redirect(new URL("/staff/login", request.url));
  }

  const [company, restaurant] = await Promise.all([
    getPlatformCompany(session.user.organizationId),
    getCompanyRestaurant(session.user.organizationId, id),
  ]);

  if (!company || !restaurant) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  await syncOrganizationStripeAccount(restaurant.id).catch(() => null);
  return NextResponse.redirect(
    new URL(
      `${getCompanyRestaurantHref(
        company.slug,
        restaurant.slug,
        "integrations",
      )}?stripe=connected`,
      request.url,
    ),
  );
}
