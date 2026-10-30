import { redirect } from "next/navigation";

import type { OrderFormMenuData } from "@/components/order/OrderForm";
import { CustomerOrderPage } from "@/components/order/CustomerOrderPage";
import { AppShell } from "@/components/shared/AppShell";
import { getDb } from "@/db";
import { isCurrentRequestPlatformAdministrationDomain } from "@/lib/domain-session";
import { getOrganizationFeatureEntitlement } from "@/lib/feature-entitlements";
import { getPublicMenu, getTenantMenuCurrency } from "@/lib/menu";
import { getRestaurantBusinessDate } from "@/lib/order-number";
import { getAppendableDineInOrder } from "@/lib/orders";
import { getResolvedRestaurantTaxes } from "@/lib/restaurant-taxes";
import { requireRestaurantWorkspaceAccess } from "@/lib/restaurant-workspace-access";
import { OPEN_DINE_IN_ORDER_QUERY_PARAM } from "@/lib/staff-restaurant-navigation";
import type { TenantContext } from "@/lib/tenant-context";
import { getDefaultCheckoutPolicy } from "@/lib/checkout-policy";
import { orderFulfilmentTypes } from "@/lib/order-fulfilment";
import { getRestaurantChargeSettings } from "@/lib/restaurant-charge-settings";

const noCustomerAuthProviders = {
  apple: false,
  email: false,
  facebook: false,
  google: false,
  phone: false,
};

async function loadInitialMenuData(
  tenantContext: TenantContext,
  includeInventory: boolean,
): Promise<OrderFormMenuData> {
  const [categories, currency, businessDate] = await Promise.all([
    getPublicMenu(tenantContext, { includeInventory }),
    getTenantMenuCurrency(tenantContext),
    getRestaurantBusinessDate(getDb(), tenantContext),
  ]);
  const resolvedTaxes = await getResolvedRestaurantTaxes(
    tenantContext.organizationId,
    categories.flatMap((category) => category.items.map((item) => item.id)),
    businessDate,
  );

  return {
    categories,
    currency,
    taxPricing: {
      pricingMode: resolvedTaxes.pricingMode,
      taxRateBps: 0,
      taxesByMenuItemId: Object.fromEntries(resolvedTaxes.taxesByMenuItemId),
      taxOverridesByFulfilmentType: Object.fromEntries(
        [...resolvedTaxes.taxOverridesByFulfilmentType].map(
          ([fulfilmentType, taxesByMenuItemId]) => [
            fulfilmentType,
            Object.fromEntries(taxesByMenuItemId),
          ],
        ),
      ),
    },
  };
}

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
  const initialMenuData = await loadInitialMenuData(
    access.tenantContext,
    inventoryEnabled,
  ).catch(() => undefined);
  const chargeSettings = await getRestaurantChargeSettings(access.restaurant.id);

  return (
    <AppShell topSpacing="compact" variant="dark" contentClassName="max-w-6xl space-y-6 pb-8">
      <CustomerOrderPage
        customerAuthProviders={noCustomerAuthProviders}
        chargeSettings={chargeSettings}
        checkoutPolicies={orderFulfilmentTypes.map(getDefaultCheckoutPolicy)}
        initialMenuData={initialMenuData}
        inventoryEnabled={inventoryEnabled}
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
