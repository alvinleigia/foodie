type CustomerOrderUrlOptions =
  | {
      domain: string;
      domainScope: "RESTAURANT";
    }
  | {
      domain: string;
      domainScope: "COMPANY" | null;
      qrSlug: string;
    };

export function buildCustomerOrderUrl(options: CustomerOrderUrlOptions) {
  const orderUrl = new URL("/order", `https://${options.domain}`);

  if (options.domainScope !== "RESTAURANT") {
    orderUrl.searchParams.set("qr", options.qrSlug);
  }

  return orderUrl.toString();
}
