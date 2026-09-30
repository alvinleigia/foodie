type CustomerOrderUrlOptions = {
  domain: string;
  domainScope: "COMPANY" | "RESTAURANT" | null;
  qrSlug: string | null;
  restaurantSlug: string;
};

export function buildCustomerOrderUrl({
  domain,
  domainScope,
  qrSlug,
  restaurantSlug,
}: CustomerOrderUrlOptions) {
  const orderUrl = new URL("/order", `https://${domain}`);

  if (qrSlug) {
    orderUrl.searchParams.set("qr", qrSlug);
  } else if (domainScope === "COMPANY") {
    orderUrl.pathname = `/order/${encodeURIComponent(restaurantSlug)}`;
  }

  return orderUrl.toString();
}
