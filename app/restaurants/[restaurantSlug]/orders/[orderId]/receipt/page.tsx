import { notFound } from "next/navigation";

import { ReceiptPage } from "@/components/receipt/ReceiptPage";
import { getOrderReceipt } from "@/lib/order-receipts";
import { requireRestaurantWorkspaceAccess } from "@/lib/restaurant-workspace-access";
import { getRestaurantWorkspaceHref } from "@/lib/restaurant-workspace";

type StaffReceiptPageProps = {
  params: Promise<{ orderId: string; restaurantSlug: string }>;
};

export default async function StaffReceiptPage({ params }: StaffReceiptPageProps) {
  const { orderId, restaurantSlug } = await params;
  const { access } = await requireRestaurantWorkspaceAccess({
    destination: "orders",
    requiredPermission: "orders.view",
    restaurantSlug,
  });
  const receipt = await getOrderReceipt(orderId, access.tenantContext);

  if (!receipt) {
    notFound();
  }

  return (
    <ReceiptPage
      backHref={getRestaurantWorkspaceHref(access.restaurant.slug, "orders")}
      canIssueVatInvoice
      receipt={receipt}
    />
  );
}
