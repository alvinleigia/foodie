import { redirect } from "next/navigation";

import { CustomerOrderPage } from "@/components/order/CustomerOrderPage";
import { AppShell } from "@/components/shared/AppShell";
import { isCurrentRequestPlatformAdministrationDomain } from "@/lib/domain-session";
import { getOrganizationFeatureEntitlement } from "@/lib/feature-entitlements";
import { requireRestaurantWorkspaceAccess } from "@/lib/restaurant-workspace-access";

const noCustomerAuthProviders = {
  apple: false,
  email: false,
  facebook: false,
  google: false,
};

const noCustomerPhoneVerification = {
  available: false,
  required: false,
};

export default async function StaffRestaurantOrderPage({
  params,
}: {
  params: Promise<{ restaurantSlug: string }>;
}) {
  if (!(await isCurrentRequestPlatformAdministrationDomain())) {
    redirect("/order");
  }

  const { restaurantSlug } = await params;
  const { access, session } = await requireRestaurantWorkspaceAccess({
    destination: "order",
    requiredPermission: "orders.create",
    restaurantSlug,
  });

  const inventoryEnabled = (
    await getOrganizationFeatureEntitlement(
      access.restaurant.id,
      "operations.inventory",
    )
  ).enabled;

  return (
    <AppShell topSpacing="compact" variant="dark" contentClassName="max-w-6xl space-y-6 pb-8">
      <CustomerOrderPage
        customerAuthProviders={noCustomerAuthProviders}
        inventoryEnabled={inventoryEnabled}
        phoneVerificationPolicy={noCustomerPhoneVerification}
        staffRestaurant={{
          id: access.restaurant.id,
          name: access.restaurant.name,
          slug: access.restaurant.slug,
        }}
        user={{
          name: session.user.name,
          role: session.user.role,
        }}
      />
    </AppShell>
  );
}
