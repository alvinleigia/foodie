import { expect, test } from "@playwright/test";

import {
  getCustomerPrivacyHref,
  getCustomerRouteSlugFromUrl,
} from "../../lib/customer-navigation";

test.describe("customer route context", () => {
  test("reads a restaurant slug from customer order paths", () => {
    expect(
      getCustomerRouteSlugFromUrl(
        new URL("https://orders.example.com/order/snack-shack"),
      ),
    ).toBe("snack-shack");
    expect(
      getCustomerRouteSlugFromUrl(
        new URL("https://orders.example.com/order/status/snack-shack"),
      ),
    ).toBe("snack-shack");
  });

  test("prefers explicit context and ignores reserved order paths", () => {
    expect(
      getCustomerRouteSlugFromUrl(
        new URL("https://orders.example.com/account?route=spice-house"),
      ),
    ).toBe("spice-house");
    expect(
      getCustomerRouteSlugFromUrl(
        new URL("https://orders.example.com/order/payment/success"),
      ),
    ).toBeNull();
    expect(
      getCustomerRouteSlugFromUrl(
        new URL("https://orders.example.com/order/status"),
      ),
    ).toBeNull();
  });

  test("keeps restaurant context on privacy notice links", () => {
    expect(getCustomerPrivacyHref({ routeSlug: "snack-shack" })).toBe(
      "/privacy?route=snack-shack",
    );
    expect(getCustomerPrivacyHref({ orderingPointQrSlug: "table-12" })).toBe(
      "/privacy?qr=table-12",
    );
  });
});
