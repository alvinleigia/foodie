import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { RestaurantTaxProfileForm } from "@/components/admin/RestaurantTaxProfileForm";
import { RestaurantTaxesManager } from "@/components/admin/RestaurantTaxesManager";
import { RestaurantWorkingHoursForm } from "@/components/admin/RestaurantWorkingHoursForm";
import { TenantRestaurantSettingsForm } from "@/components/admin/TenantAdminForms";
import { getRestaurantTaxProfile } from "@/lib/restaurant-tax-profile";
import { getRestaurantWorkingHours } from "@/lib/restaurant-working-hours";
import { requireRestaurantWorkspaceAdminPage } from "@/lib/restaurant-workspace-access";
import {
  getRestaurantWorkspaceHref,
  type RestaurantWorkspacePageProps,
} from "@/lib/restaurant-workspace";

export default async function RestaurantSettingsPage({
  params,
}: RestaurantWorkspacePageProps) {
  const { restaurantSlug } = await params;
  const { access, session, snapshot } =
    await requireRestaurantWorkspaceAdminPage({
      destination: "settings",
      requiredPermission: "restaurant.settings",
      restaurantSlug,
    });
  const settingsHref = getRestaurantWorkspaceHref(
    access.restaurant.slug,
    "settings",
  );
  const [taxProfile, workingHours] = await Promise.all([
    getRestaurantTaxProfile(access.restaurant.id),
    getRestaurantWorkingHours(access.restaurant.id),
  ]);

  if (!workingHours) {
    throw new Error("Restaurant working hours could not be loaded.");
  }

  return (
    <SaasAdminShell
      activePath={settingsHref}
      eyebrow="Restaurant"
      title="Restaurant settings"
      description="Edit the current restaurant profile in a focused setup screen."
      user={{
        name: session.user.name,
        organizationId: session.user.organizationId,
        permissions: session.user.permissions,
        role: session.user.role,
      }}
    >
      <div className="grid gap-6">
        <TenantRestaurantSettingsForm
          backHref={getRestaurantWorkspaceHref(
            access.restaurant.slug,
            "dashboard",
          )}
          organization={snapshot.organization}
        />
        <RestaurantWorkingHoursForm
          apiPath="/api/tenant/admin/working-hours"
          initialValue={workingHours}
        />
        <RestaurantTaxProfileForm
          apiPath="/api/tenant/admin/tax-profile"
          profile={taxProfile}
        />
        <RestaurantTaxesManager apiPath="/api/tenant/admin/taxes" />
      </div>
    </SaasAdminShell>
  );
}

