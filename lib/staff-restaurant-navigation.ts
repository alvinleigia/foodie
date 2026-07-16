export const STAFF_RESTAURANT_QUERY_PARAM = "staffRestaurant";

export function getStaffRestaurantOrderHref(restaurantSlug: string) {
  return `/restaurants/${encodeURIComponent(restaurantSlug)}/order`;
}

export function withStaffRestaurantContext(path: string, restaurantSlug?: string) {
  if (!restaurantSlug) {
    return path;
  }

  const separator = path.includes("?") ? "&" : "?";

  return `${path}${separator}${STAFF_RESTAURANT_QUERY_PARAM}=${encodeURIComponent(restaurantSlug)}`;
}
