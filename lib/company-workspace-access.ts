import { notFound, redirect } from "next/navigation";

import { requireRole } from "@/lib/auth";
import {
  getCompanyRestaurant,
  getCompanyRestaurantBySlug,
  getPlatformCompany,
} from "@/lib/saas-admin";
import { companyAdminRoles } from "@/lib/role-access";
import {
  getCompanyRestaurantHref,
  getCompanyWorkspaceHref,
  type CompanyRestaurantDestination,
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
    redirect("/dashboard");
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

export async function redirectToActiveCompanyWorkspace(
  destination: CompanyWorkspaceDestination,
) {
  const { company } = await requireCompanyWorkspaceAccess({ destination });

  redirect(getCompanyWorkspaceHref(company.slug, destination));
}

export async function redirectToActiveCompanyRestaurantWorkspace(
  restaurantId: string,
  destination: CompanyRestaurantDestination,
) {
  const { company } = await requireCompanyWorkspaceAccess({
    destination: "restaurants",
  });
  const restaurant = await getCompanyRestaurant(company.id, restaurantId);

  if (!restaurant) {
    notFound();
  }

  redirect(getCompanyRestaurantHref(company.slug, restaurant.slug, destination));
}
