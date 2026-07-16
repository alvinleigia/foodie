import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { StaffInviteForm } from "@/components/admin/StaffInviteForm";
import {
  getCompanyRestaurantHref,
  getCompanyWorkspaceHref,
} from "@/lib/company-workspace";
import { requireCompanyRestaurantWorkspaceAccess } from "@/lib/company-workspace-access";

type CompanyRestaurantStaffInvitePageProps = {
  params: Promise<{ companySlug: string; restaurantSlug: string }>;
};

export default async function CompanyWorkspaceRestaurantStaffInvitePage({
  params,
}: CompanyRestaurantStaffInvitePageProps) {
  const { companySlug, restaurantSlug } = await params;
  const { company, restaurant, session } =
    await requireCompanyRestaurantWorkspaceAccess({
      companySlug,
      restaurantSlug,
    });
  const staffHref = getCompanyRestaurantHref(
    company.slug,
    restaurant.slug,
    "staff",
  );
  const assignHref = `${getCompanyWorkspaceHref(company.slug, "userReassign")}?restaurantSlug=${encodeURIComponent(restaurant.slug)}&role=ORDER_OPERATOR&returnTo=${encodeURIComponent(staffHref)}`;

  return (
    <SaasAdminShell
      activePath={getCompanyWorkspaceHref(company.slug, "restaurants")}
      eyebrow="Company"
      title="Invite staff"
      description={`Create a one-time invite link for ${restaurant.name}.`}
      user={{
        name: session.user.name,
        organizationId: session.user.organizationId,
        role: session.user.role,
      }}
    >
      <StaffInviteForm
        apiPath={`/api/company/restaurants/${restaurant.id}/staff`}
        assignExistingHref={assignHref}
        backHref={staffHref}
        defaultRole="RESTAURANT_MANAGER"
        description={`Invite a manager or operator to ${restaurant.name}.`}
        roles={[
          { label: "Restaurant Manager", value: "RESTAURANT_MANAGER" },
          { label: "Order Operator", value: "ORDER_OPERATOR" },
        ]}
        title="Invite restaurant staff"
      />
    </SaasAdminShell>
  );
}
