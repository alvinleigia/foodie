import { notFound } from "next/navigation";

import { ReceiptPage } from "@/components/receipt/ReceiptPage";
import { getOrderReceipt } from "@/lib/order-receipts";
import { operationalRoles } from "@/lib/role-access";
import { requireRestaurantWorkspaceAccess } from "@/lib/restaurant-workspace-access";
import { getRestaurantWorkspaceHref } from "@/lib/restaurant-workspace";

type StaffReceiptPageProps = {
  params: Promise<{ orderId: string; restaurantSlug: string }>;
};

export default async function StaffReceiptPage({ params }: StaffReceiptPageProps) {
  const { orderId, restaurantSlug } = await params;
  const { access } = await requireRestaurantWorkspaceAccess({
    allowedRoles: operationalRoles,
    destination: "orders",
    restaurantSlug,
  });
  const receipt = await getOrderReceipt(orderId, access.tenantContext);

  if (!receipt) {
    notFound();
  }

  return (
    <ReceiptPage
      backHref={getRestaurantWorkspaceHref(access.restaurant.slug, "orders")}
      receipt={receipt}
    />
  );
}
