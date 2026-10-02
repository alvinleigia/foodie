export const STAFF_RESTAURANT_QUERY_PARAM = "staffRestaurant";
export const OPEN_DINE_IN_ORDER_QUERY_PARAM = "openOrder";

export function getStaffRestaurantOrderHref(restaurantSlug: string) {
  return `/restaurants/${encodeURIComponent(restaurantSlug)}/order`;
}

export function getStaffRestaurantAddItemsHref(
  restaurantSlug: string,
  orderId: string,
) {
  const path = getStaffRestaurantOrderHref(restaurantSlug);

  return `${path}?${OPEN_DINE_IN_ORDER_QUERY_PARAM}=${encodeURIComponent(orderId)}`;
}

export function withStaffRestaurantContext(path: string, restaurantSlug?: string) {
  if (!restaurantSlug) {
    return path;
  }

  const separator = path.includes("?") ? "&" : "?";

  return `${path}${separator}${STAFF_RESTAURANT_QUERY_PARAM}=${encodeURIComponent(restaurantSlug)}`;
}
