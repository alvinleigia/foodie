import { AppHeader } from "@/components/shared/AppHeader";
import { AppShell } from "@/components/shared/AppShell";
import { CustomerOrderStatus } from "@/components/order/CustomerOrderStatus";

function getCustomerHref(path: "/order" | "/order/status", options: {
  locationQrSlug?: string;
  locationSlug?: string;
}) {
  if (options.locationSlug) {
    return `${path}/${encodeURIComponent(options.locationSlug)}`;
  }

  if (options.locationQrSlug) {
    return `${path}?qr=${encodeURIComponent(options.locationQrSlug)}`;
  }

  return path;
}

type CustomerOrderStatusPageProps = {
  searchParams: PageProps<"/order/status">["searchParams"];
  locationSlug?: string;
};

export default async function CustomerOrderStatusPage(props: CustomerOrderStatusPageProps) {
  const searchParams = await props.searchParams;
  const qrValue = searchParams.qr;
  const locationQrSlug = typeof qrValue === "string" ? qrValue : undefined;

  return (
    <AppShell topSpacing="compact" variant="dark" contentClassName="max-w-6xl space-y-6 pb-8">
      <AppHeader
        activePath="/order/status"
        customerMenu={{
          orderHref: getCustomerHref("/order", {
            locationQrSlug,
            locationSlug: props.locationSlug,
          }),
          ordersHref: getCustomerHref("/order/status", {
            locationQrSlug,
            locationSlug: props.locationSlug,
          }),
        }}
      />
      <CustomerOrderStatus
        locationQrSlug={locationQrSlug}
        locationSlug={props.locationSlug}
        refreshKey={0}
      />
    </AppShell>
  );
}
