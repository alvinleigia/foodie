import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { RestaurantStaffPanel } from "@/components/admin/RestaurantStaffPanel";
import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { canAccessRole, companyAdminRoles } from "@/lib/role-access";
import {
  getCompanyRestaurant,
  listRestaurantStaffMemberships,
} from "@/lib/saas-admin";

export default async function CompanyRestaurantStaffPage(
  props: { params: Promise<{ id: string }> },
) {
  const session = await auth();

  if (
    !session?.user?.role ||
    !session.user.organizationId ||
    !canAccessRole(session.user.role, companyAdminRoles)
  ) {
    redirect("/staff/login");
  }

  const { id } = await props.params;
  const restaurant = await getCompanyRestaurant(session.user.organizationId, id);
  const staff = await listRestaurantStaffMemberships(
    session.user.organizationId,
    id,
  );

  if (!restaurant || !staff) {
    notFound();
  }

  const currentHref = `/company/restaurants/${restaurant.id}/staff`;

  return (
    <SaasAdminShell
      activePath="/company"
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
        assignHref={`/company/users/reassign?restaurantId=${restaurant.id}&role=ORDER_OPERATOR&returnTo=${encodeURIComponent(currentHref)}`}
        backHref={`/company/restaurants/${restaurant.id}`}
        currentHref={currentHref}
        inviteHref={`${currentHref}/invite`}
        restaurantName={restaurant.name}
        staff={staff}
      />
    </SaasAdminShell>
  );
}
