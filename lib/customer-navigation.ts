type PublicCustomerContextOptions = {
  locationQrSlug?: string;
  locationSlug?: string;
};

export function withPublicCustomerContext(
  path: string,
  { locationQrSlug, locationSlug }: PublicCustomerContextOptions,
) {
  const url = new URL(path, "https://foodie.local");

  if (locationQrSlug) {
    url.searchParams.set("qr", locationQrSlug);
  } else if (locationSlug) {
    url.searchParams.set("location", locationSlug);
  }

  return `${url.pathname}${url.search}${url.hash}`;
}

export function getCustomerOrderHref(
  path: "/order" | "/order/status",
  { locationQrSlug, locationSlug }: PublicCustomerContextOptions,
) {
  if (locationSlug) {
    return `${path}/${encodeURIComponent(locationSlug)}`;
  }

  return withPublicCustomerContext(path, { locationQrSlug });
}

export function getCustomerLoginHref({
  locationQrSlug,
  locationSlug,
  returnTo,
}: PublicCustomerContextOptions & { returnTo: string }) {
  const loginHref = new URL("/customer/login", "https://foodie.local");
  loginHref.searchParams.set(
    "returnTo",
    withPublicCustomerContext(returnTo, { locationQrSlug, locationSlug }),
  );

  return withPublicCustomerContext(
    `${loginHref.pathname}${loginHref.search}`,
    { locationQrSlug, locationSlug },
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
