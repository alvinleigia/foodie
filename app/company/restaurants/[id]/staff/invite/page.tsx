import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { StaffInviteForm } from "@/components/admin/StaffInviteForm";
import { canAccessRole, companyAdminRoles } from "@/lib/role-access";
import { getCompanyRestaurant } from "@/lib/saas-admin";

export default async function CompanyRestaurantStaffInvitePage(
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

  if (!restaurant) {
    notFound();
  }

  const staffHref = `/company/restaurants/${restaurant.id}/staff`;
  const assignHref = `/company/users/reassign?restaurantId=${restaurant.id}&role=ORDER_OPERATOR&returnTo=${encodeURIComponent(staffHref)}`;

  return (
    <SaasAdminShell
      activePath="/company"
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
