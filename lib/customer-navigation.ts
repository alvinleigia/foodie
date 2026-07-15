type PublicCustomerContextOptions = {
  orderingPointQrSlug?: string;
  routeSlug?: string;
};

export function getCustomerRouteSlugFromUrl(url: URL) {
  const explicitRouteSlug = url.searchParams.get("route");

  if (explicitRouteSlug) {
    return explicitRouteSlug;
  }

  const segments = url.pathname.split("/").filter(Boolean);
  const encodedRouteSlug =
    segments.length === 2 &&
    segments[0] === "order" &&
    !["payment", "status"].includes(segments[1])
      ? segments[1]
      : segments.length === 3 &&
          segments[0] === "order" &&
          segments[1] === "status"
        ? segments[2]
        : null;

  if (!encodedRouteSlug) {
    return null;
  }

  try {
    return decodeURIComponent(encodedRouteSlug);
  } catch {
    return null;
  }
}

export function withPublicCustomerContext(
  path: string,
  { orderingPointQrSlug, routeSlug }: PublicCustomerContextOptions,
) {
  const url = new URL(path, "https://foodie.local");

  if (orderingPointQrSlug) {
    url.searchParams.set("qr", orderingPointQrSlug);
  } else if (routeSlug) {
    url.searchParams.set("route", routeSlug);
  }

  return `${url.pathname}${url.search}${url.hash}`;
}

export function getCustomerOrderHref(
  path: "/order" | "/order/status",
  { orderingPointQrSlug, routeSlug }: PublicCustomerContextOptions,
) {
  if (routeSlug) {
    return `${path}/${encodeURIComponent(routeSlug)}`;
  }

  return withPublicCustomerContext(path, { orderingPointQrSlug });
}

export function getCustomerLoginHref({
  orderingPointQrSlug,
  routeSlug,
  returnTo,
}: PublicCustomerContextOptions & { returnTo: string }) {
  const loginHref = new URL("/customer/login", "https://foodie.local");
  loginHref.searchParams.set(
    "returnTo",
    withPublicCustomerContext(returnTo, { orderingPointQrSlug, routeSlug }),
  );

  return withPublicCustomerContext(
    `${loginHref.pathname}${loginHref.search}`,
    { orderingPointQrSlug, routeSlug },
  );
}

export function getSafeCustomerReturnTo(
  value: string | string[] | undefined,
  fallback = "/order/status",
) {
  if (typeof value !== "string" || value.length > 2_048 || !value.startsWith("/")) {
    return fallback;
  }

  try {
    const url = new URL(value, "https://foodie.local");

    if (url.origin !== "https://foodie.local") {
      return fallback;
    }

    const isCustomerRoute =
      url.pathname === "/account" ||
      url.pathname === "/order" ||
      url.pathname.startsWith("/order/");

    return isCustomerRoute
      ? `${url.pathname}${url.search}${url.hash}`
      : fallback;
  } catch {
    return fallback;
  }
}
