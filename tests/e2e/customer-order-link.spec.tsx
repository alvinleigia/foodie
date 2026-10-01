import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import { buildCustomerOrderUrl } from "@/lib/customer-order-links";

test.describe("customer order link", () => {
  test("uses the stable QR slug on a branded domain", () => {
    expect(
      buildCustomerOrderUrl({
        domain: "all-go-online.foodie.example",
        domainScope: "COMPANY",
        qrSlug: "snack-shack-main",
      }),
    ).toBe(
      "https://all-go-online.foodie.example/order?qr=snack-shack-main",
    );
  });

  test("uses the QR slug on the platform company domain", () => {
    expect(
      buildCustomerOrderUrl({
        domain: "foodie.allgoonline.co.uk",
        domainScope: null,
        qrSlug: "snack-shack",
      }),
    ).toBe("https://foodie.allgoonline.co.uk/order?qr=snack-shack");
  });

  test("uses the order root without a QR parameter on a restaurant domain", () => {
    expect(
      buildCustomerOrderUrl({
        domain: "orders.snack-shack.example",
        domainScope: "RESTAURANT",
      }),
    ).toBe("https://orders.snack-shack.example/order");
  });

  test("offers copy, open and printable QR controls", () => {
    const source = readFileSync(
      "components/admin/CustomerOrderLinkPanel.tsx",
      "utf8",
    );

    expect(source).toContain('import { QRCodeSVG } from "qrcode.react"');
    expect(source).toContain("navigator.clipboard.writeText(customerOrderUrl)");
    expect(source).toContain('type: "image/svg+xml;charset=utf-8"');
    expect(source).toContain("Download QR");
    expect(source).toContain("Open menu");
  });

  test("keeps customer ordering configuration in restaurant settings only", () => {
    const dashboardSource = readFileSync(
      "components/admin/RestaurantAdminPanel.tsx",
      "utf8",
    );
    const navigationSource = readFileSync("lib/staff-navigation.ts", "utf8");
    const orderingPointPageSource = readFileSync(
      "app/restaurants/[restaurantSlug]/ordering-point/page.tsx",
      "utf8",
    );
    const settingsPageSource = readFileSync(
      "app/restaurants/[restaurantSlug]/settings/page.tsx",
      "utf8",
    );

    expect(dashboardSource).not.toContain("CustomerOrderLinkPanel");
    expect(navigationSource).not.toContain('label: "Customer ordering"');
    expect(orderingPointPageSource).toContain('destination: "settings"');
    expect(orderingPointPageSource).toContain("#customer-ordering");
    expect(settingsPageSource).toContain("CustomerOrderLinkPanel");
    expect(settingsPageSource).toContain("TenantOrderingPointSettingsForm");
    expect(settingsPageSource).toContain('id="customer-ordering"');
  });

  test("ignores generated platform subdomains when selecting custom domains", () => {
    const source = readFileSync("lib/tenant-domains.ts", "utf8");

    expect(source).toContain(
      "!isPlatformManagedTenantDomain(domainRecord.domain)",
    );
    expect(source).toContain("preferredRestaurantDomain");
    expect(source).toContain("preferredCompanyDomain?.domain ?? ROOT_DOMAIN");
  });
});
