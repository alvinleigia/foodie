import { redirect } from "next/navigation";

import { CustomerOrderPage } from "@/components/order/CustomerOrderPage";
import { AppShell } from "@/components/shared/AppShell";
import { isCurrentRequestPlatformAdministrationDomain } from "@/lib/domain-session";
import { getStaffRestaurantOrderHref } from "@/lib/staff-restaurant-navigation";
import { getCurrentStaffRestaurantAccess } from "@/lib/tenant-context";

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

  const staffAccess = await getCurrentStaffRestaurantAccess().catch(() => null);

  if (!staffAccess) {
    redirect("/staff/login");
  }

  const { restaurantSlug } = await params;

  if (staffAccess.restaurant.slug !== restaurantSlug.trim().toLowerCase()) {
    redirect(getStaffRestaurantOrderHref(staffAccess.restaurant.slug));
  }

  return (
    <AppShell topSpacing="compact" variant="dark" contentClassName="max-w-6xl space-y-6 pb-8">
      <CustomerOrderPage
        customerAuthProviders={noCustomerAuthProviders}
        phoneVerificationPolicy={noCustomerPhoneVerification}
        staffRestaurant={{
          id: staffAccess.restaurant.id,
          name: staffAccess.restaurant.name,
          slug: staffAccess.restaurant.slug,
        }}
        user={{
          name: staffAccess.user.name,
          role: staffAccess.role,
        }}
      />
    </AppShell>
  );
}
