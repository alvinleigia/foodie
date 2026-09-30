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
        restaurantSlug: "snack-shack",
      }),
    ).toBe(
      "https://all-go-online.foodie.example/order?qr=snack-shack-main",
    );
  });

  test("falls back to the restaurant route on a company domain", () => {
    expect(
      buildCustomerOrderUrl({
        domain: "all-go-online.foodie.example",
        domainScope: "COMPANY",
        qrSlug: null,
        restaurantSlug: "snack-shack",
      }),
    ).toBe("https://all-go-online.foodie.example/order/snack-shack");
  });

  test("uses the order root on a restaurant domain", () => {
    expect(
      buildCustomerOrderUrl({
        domain: "orders.snack-shack.example",
        domainScope: "RESTAURANT",
        qrSlug: null,
        restaurantSlug: "snack-shack",
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
});
