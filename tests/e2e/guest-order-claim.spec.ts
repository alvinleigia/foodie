import fs from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { getGuestOrderClaimContactMatch } from "@/lib/guest-order-claim";
import { claimGuestOrderSchema } from "@/lib/validations/order";

const root = process.cwd();

function source(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test.describe("guest order claims", () => {
  test("matches only verified customer contact details", () => {
    const order = {
      customerEmail: "Guest@Example.com",
      customerPhone: "+44 7700 900123",
    };

    expect(
      getGuestOrderClaimContactMatch(order, {
        email: "guest@example.com",
        emailVerifiedAt: new Date(),
        phone: null,
        phoneVerifiedAt: null,
      }),
    ).toEqual({ emailMatches: true, phoneMatches: false });
    expect(
      getGuestOrderClaimContactMatch(order, {
        email: "guest@example.com",
        emailVerifiedAt: null,
        phone: "+447700900123",
        phoneVerifiedAt: new Date(),
      }),
    ).toEqual({ emailMatches: false, phoneMatches: true });
    expect(
      getGuestOrderClaimContactMatch(order, {
        email: "other@example.com",
        emailVerifiedAt: new Date(),
        phone: "+447700900999",
        phoneVerifiedAt: new Date(),
      }),
    ).toEqual({ emailMatches: false, phoneMatches: false });
  });

  test("requires the guest order token", () => {
    expect(
      claimGuestOrderSchema.safeParse({ customerToken: "short" }).success,
    ).toBe(false);
    expect(
      claimGuestOrderSchema.safeParse({ customerToken: "a".repeat(32) }).success,
    ).toBe(true);
  });

  test("requires authentication, tenant scope, token ownership and explicit action", () => {
    const route = source("app/api/orders/[id]/claim/route.ts");
    const claim = source("lib/customer-order-claim.ts");
    const status = source("components/order/CustomerOrderStatus.tsx");
    const paymentSuccess = source("app/order/payment/success/page.tsx");

    expect(route).toContain("requireCustomerSession");
    expect(route).toContain("getPublicTenantContextFromRequest");
    expect(claim).toContain("eq(orders.customerToken, customerToken)");
    expect(claim).toContain('order.checkoutMode !== "GUEST"');
    expect(claim).toContain("isNull(orders.organizationCustomerId)");
    expect(claim).toContain('.for("update")');
    expect(status).toContain("Add to my account");
    expect(status).toContain('order.checkoutMode === "GUEST"');
    expect(paymentSuccess).toContain("Sign in to save order");
  });
});
