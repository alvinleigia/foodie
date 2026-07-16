import { notFound } from "next/navigation";

import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { TenantStaffAccessForm } from "@/components/admin/TenantAdminForms";
import { restaurantAdminRoles } from "@/lib/role-access";
import { requireRestaurantWorkspaceAdminPage } from "@/lib/restaurant-workspace-access";
import {
  getRestaurantWorkspaceHref,
  type RestaurantWorkspacePageProps,
} from "@/lib/restaurant-workspace";

type RestaurantStaffAccessPageProps = RestaurantWorkspacePageProps & {
  params: Promise<{ membershipId: string; restaurantSlug: string }>;
};

export default async function RestaurantStaffAccessPage({
  params,
}: RestaurantStaffAccessPageProps) {
  const { membershipId, restaurantSlug } = await params;
  const { access, session, snapshot } =
    await requireRestaurantWorkspaceAdminPage({
      allowedRoles: restaurantAdminRoles,
      destination: "staff",
      restaurantSlug,
    });
  const staff = snapshot.staff.find((item) => item.membershipId === membershipId);

  if (!staff) {
    notFound();
  }

  const staffHref = getRestaurantWorkspaceHref(access.restaurant.slug, "staff");

  return (
    <SaasAdminShell
      activePath={staffHref}
      eyebrow="Staff"
      title="Edit staff access"
      description="Adjust this user's role or active access for the current restaurant."
      user={{
        name: session.user.name,
        organizationId: session.user.organizationId,
        role: session.user.role,
      }}
    >
      <TenantStaffAccessForm backHref={staffHref} staff={staff} />
    </SaasAdminShell>
  );
}

