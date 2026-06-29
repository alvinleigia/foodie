import { ReassignExistingUserForm } from "@/components/admin/ReassignExistingUserForm";
import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { requireRestaurantAdminPage } from "@/lib/restaurant-admin-page";
import {
  listRestaurantReassignableUsers,
  listRestaurantReassignmentTargets,
} from "@/lib/saas-admin";

function getSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function RestaurantStaffReassignPage(
  props: PageProps<"/restaurant/staff/reassign">,
) {
  const { session, snapshot } = await requireRestaurantAdminPage();

  if (!snapshot.organization || !snapshot.location) {
    return null;
  }

  const context = {
    organizationId: snapshot.organization.id,
    locationId: snapshot.location.id,
  };
  const [targets, users] = await Promise.all([
    listRestaurantReassignmentTargets(context),
    listRestaurantReassignableUsers(context),
  ]);
  const searchParams = await props.searchParams;
  const initialIdentifier = getSearchParam(searchParams.identifier);

  return (
    <SaasAdminShell
      activePath="/restaurant"
      eyebrow="Staff"
      title="Assign existing staff"
      description="Move or add access for an accepted user inside this restaurant location."
      user={{
        name: session.user.name,
        organizationId: session.user.organizationId,
        role: session.user.role,
      }}
    >
      <ReassignExistingUserForm
        apiPath="/api/tenant/admin/staff/reassign"
        backHref="/restaurant"
        initialCompanyId={targets[0]?.id}
        initialIdentifier={initialIdentifier}
        initialLocationId={snapshot.location.id}
        initialRestaurantId={snapshot.organization.id}
        initialRole="ORDER_OPERATOR"
        roleOptions={[
          { label: "Restaurant Manager", value: "RESTAURANT_MANAGER" },
          { label: "Order Operator", value: "ORDER_OPERATOR" },
        ]}
        targets={targets}
        users={users}
      />
    </SaasAdminShell>
  );
}
