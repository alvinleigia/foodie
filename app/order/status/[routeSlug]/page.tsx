import CustomerOrderStatusPage from "@/app/order/status/page";

export default async function RestaurantOrderStatusPage(
  props: PageProps<"/order/status/[routeSlug]">,
) {
  const params = await props.params;

  return (
    <CustomerOrderStatusPage
      searchParams={props.searchParams}
      routeSlug={params.routeSlug}
    />
  );
}
