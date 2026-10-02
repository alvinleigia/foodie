import { redirect } from "next/navigation";

import { CustomerOrderPage } from "@/components/order/CustomerOrderPage";
import { AppShell } from "@/components/shared/AppShell";
import { isCurrentRequestPlatformAdministrationDomain } from "@/lib/domain-session";
import { getOrganizationFeatureEntitlement } from "@/lib/feature-entitlements";
import { getAppendableDineInOrder } from "@/lib/orders";
import { requireRestaurantWorkspaceAccess } from "@/lib/restaurant-workspace-access";
import { OPEN_DINE_IN_ORDER_QUERY_PARAM } from "@/lib/staff-restaurant-navigation";

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
  searchParams,
}: {
  params: Promise<{ restaurantSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
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
  const query = await searchParams;
  const requestedOpenOrder = query[OPEN_DINE_IN_ORDER_QUERY_PARAM];
  const openDineInOrderId =
    typeof requestedOpenOrder === "string" ? requestedOpenOrder : null;
  const openDineInOrder = openDineInOrderId
    ? await getAppendableDineInOrder(
        openDineInOrderId,
        access.tenantContext,
      )
    : null;

  if (openDineInOrderId && !openDineInOrder) {
    redirect(`/restaurants/${encodeURIComponent(access.restaurant.slug)}/orders`);
  }

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
        openDineInOrder={openDineInOrder}
        staffRestaurant={{
          id: access.restaurant.id,
          name: access.restaurant.name,
          slug: access.restaurant.slug,
        }}
        user={{
          name: session.user.name,
          permissions: session.user.permissions,
          role: session.user.role,
        }}
      />
    </AppShell>
  );
}
