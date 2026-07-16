import { RestaurantStaffPanel } from "@/components/admin/RestaurantStaffPanel";
import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import {
  getCompanyRestaurantHref,
  getCompanyWorkspaceHref,
} from "@/lib/company-workspace";
import { requireCompanyRestaurantWorkspaceAccess } from "@/lib/company-workspace-access";
import { listRestaurantStaffMemberships } from "@/lib/saas-admin";

type CompanyRestaurantStaffPageProps = {
  params: Promise<{ companySlug: string; restaurantSlug: string }>;
};

export default async function CompanyWorkspaceRestaurantStaffPage({
  params,
}: CompanyRestaurantStaffPageProps) {
  const { companySlug, restaurantSlug } = await params;
  const { company, restaurant, session } =
    await requireCompanyRestaurantWorkspaceAccess({
      companySlug,
      restaurantSlug,
    });
  const staff = await listRestaurantStaffMemberships(company.id, restaurant.id);

  if (!staff) {
    return null;
  }

  const currentHref = getCompanyRestaurantHref(
    company.slug,
    restaurant.slug,
    "staff",
  );

  return (
    <SaasAdminShell
      activePath={getCompanyWorkspaceHref(company.slug, "restaurants")}
      eyebrow="Company"
      title={`${restaurant.name} staff`}
      description="Manage staff access for this restaurant."
      user={{
        name: session.user.name,
        organizationId: session.user.organizationId,
        role: session.user.role,
      }}
    >
      <RestaurantStaffPanel
        assignHref={`${getCompanyWorkspaceHref(company.slug, "userReassign")}?restaurantId=${restaurant.id}&role=ORDER_OPERATOR&returnTo=${encodeURIComponent(currentHref)}`}
        backHref={getCompanyRestaurantHref(
          company.slug,
          restaurant.slug,
          "settings",
        )}
        currentHref={currentHref}
        editHrefBase={getCompanyWorkspaceHref(company.slug, "users")}
        inviteHref={getCompanyRestaurantHref(
          company.slug,
          restaurant.slug,
          "staffInvite",
        )}
        restaurantName={restaurant.name}
        staff={staff}
      />
    </SaasAdminShell>
  );
}
