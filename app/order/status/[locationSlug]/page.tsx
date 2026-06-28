import CustomerOrderStatusPage from "@/app/order/status/page";

export default async function LocationOrderStatusPage(
  props: PageProps<"/order/status/[locationSlug]">,
) {
  const params = await props.params;

  return (
    <CustomerOrderStatusPage
      searchParams={props.searchParams}
      locationSlug={params.locationSlug}
    />
  );
}
