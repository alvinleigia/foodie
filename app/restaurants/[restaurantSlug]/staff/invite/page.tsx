import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { TenantStaffInviteForm } from "@/components/admin/TenantAdminForms";
import { restaurantAdminRoles } from "@/lib/role-access";
import { requireRestaurantWorkspaceAccess } from "@/lib/restaurant-workspace-access";
import {
  getRestaurantWorkspaceHref,
  type RestaurantWorkspacePageProps,
} from "@/lib/restaurant-workspace";

export default async function RestaurantStaffInvitePage({
  params,
}: RestaurantWorkspacePageProps) {
  const { restaurantSlug } = await params;
  const { access, session } = await requireRestaurantWorkspaceAccess({
    allowedRoles: restaurantAdminRoles,
    destination: "staffInvite",
    restaurantSlug,
  });
  const staffHref = getRestaurantWorkspaceHref(access.restaurant.slug, "staff");

  return (
    <SaasAdminShell
      activePath={staffHref}
      eyebrow="Staff"
      title="Invite staff"
      description="Create a one-time invitation link for this restaurant."
      user={{
        name: session.user.name,
        organizationId: session.user.organizationId,
        role: session.user.role,
      }}
    >
      <TenantStaffInviteForm
        assignExistingHref={getRestaurantWorkspaceHref(
          access.restaurant.slug,
          "staffReassign",
        )}
        backHref={staffHref}
      />
    </SaasAdminShell>
  );
}
