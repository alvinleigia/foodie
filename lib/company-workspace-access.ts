import { notFound, redirect } from "next/navigation";

import { requireRole } from "@/lib/auth";
import {
  getCompanyRestaurantBySlug,
  getPlatformCompany,
} from "@/lib/saas-admin";
import { companyAdminRoles } from "@/lib/role-access";
import {
  getCompanyWorkspaceHref,
  type CompanyWorkspaceDestination,
} from "@/lib/company-workspace";

type CompanyWorkspaceAccessOptions = {
  companySlug?: string;
  destination: CompanyWorkspaceDestination;
};

export async function requireCompanyWorkspaceAccess({
  companySlug,
  destination,
}: CompanyWorkspaceAccessOptions) {
  const session = await requireRole([...companyAdminRoles]);

  if (!session?.user.organizationId) {
    redirect("/staff/login");
  }

  const company = await getPlatformCompany(session.user.organizationId);

  if (!company) {
    notFound();
  }

  if (companySlug && company.slug !== companySlug.trim().toLowerCase()) {
    redirect(getCompanyWorkspaceHref(company.slug, destination));
  }

  return { company, session };
}

export async function requireCompanyRestaurantWorkspaceAccess({
  companySlug,
  restaurantSlug,
}: {
  companySlug: string;
  restaurantSlug: string;
}) {
  const { company, session } = await requireCompanyWorkspaceAccess({
    companySlug,
    destination: "restaurants",
  });
  const restaurant = await getCompanyRestaurantBySlug(
    company.id,
    restaurantSlug.trim().toLowerCase(),
  );

  if (!restaurant) {
    notFound();
  }

  return { company, restaurant, session };
}
