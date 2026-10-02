import fs from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import {
  getDefaultCheckoutPolicy,
  getPayLaterLabel,
  isCheckoutContactValid,
} from "@/lib/checkout-policy";
import { restaurantCheckoutPolicySchema } from "@/lib/validations/checkout-policy";
import { createOrderSchema } from "@/lib/validations/order";

const root = process.cwd();

function source(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function customerOrder(overrides: Record<string, unknown> = {}) {
  return {
    checkoutMode: "GUEST",
    customerContact: {
      email: "guest@example.com",
      name: "Guest Customer",
      phone: "+447700900123",
    },
    fulfilmentType: "DELIVERY",
    paymentTiming: "ONLINE",
    deliveryAddress: {
      city: "London",
      countryCode: "gb",
      instructions: "Ring the bell",
      line1: "10 High Street",
      line2: "Flat 2",
      postalCode: "SW1A 1AA",
      region: "Greater London",
    },
    items: [
      {
        categoryId: "11111111-1111-4111-8111-111111111111",
        drinkId: "22222222-2222-4222-8222-222222222222",
        modifiers: [],
        notes: "",
        quantity: 1,
      },
    ],
    ...overrides,
  };
}

test.describe("restaurant checkout policies", () => {
  test("provides practical defaults for all fulfilment types", () => {
    expect(getDefaultCheckoutPolicy("DINE_IN").contactRequirement).toBe(
      "EMAIL_OR_PHONE",
    );
    expect(getDefaultCheckoutPolicy("PICKUP").guestCheckoutEnabled).toBe(true);
    expect(getDefaultCheckoutPolicy("DELIVERY").contactRequirement).toBe(
      "EMAIL_AND_PHONE",
    );
    expect(getPayLaterLabel("DINE_IN")).toBe("Pay at restaurant");
    expect(getPayLaterLabel("PICKUP")).toBe("Pay at collection");
    expect(getPayLaterLabel("DELIVERY")).toBe("Cash on delivery");
  });

  test("requires online payment whenever guest checkout is enabled", () => {
    expect(
      restaurantCheckoutPolicySchema.safeParse({
        ...getDefaultCheckoutPolicy("PICKUP"),
        onlinePaymentEnabled: false,
      }).success,
    ).toBe(false);
  });

  test("supports configurable email and mobile requirements", () => {
    expect(
      isCheckoutContactValid("EMAIL_OR_PHONE", {
        email: null,
        phone: "+447700900123",
      }),
    ).toBe(true);
    expect(
      isCheckoutContactValid("EMAIL_AND_PHONE", {
        email: "guest@example.com",
        phone: null,
      }),
    ).toBe(false);
  });

  test("validates guest prepayment and a structured delivery address", () => {
    const result = createOrderSchema.safeParse(customerOrder());

    expect(result.success).toBe(true);
    expect(result.success && result.data.deliveryAddress?.countryCode).toBe("GB");
    expect(
      createOrderSchema.safeParse(
        customerOrder({ paymentTiming: "PAY_LATER" }),
      ).success,
    ).toBe(false);
    expect(
      createOrderSchema.safeParse(
        customerOrder({
          deliveryAddress: {
            ...customerOrder().deliveryAddress,
            countryCode: "",
          },
        }),
      ).success,
    ).toBe(false);
  });

  test("enforces policies in the order API and exposes settings controls", () => {
    const api = source("app/api/orders/route.ts");
    const form = source("components/order/OrderForm.tsx");
    const settings = source("components/admin/RestaurantCheckoutPoliciesForm.tsx");
    const migration = source(
      "drizzle/0063_checkout_policies_and_guest_orders.sql",
    );
    const paymentResult = source("lib/order-payments.ts");

    expect(api).toContain("getRestaurantCheckoutPolicies");
    expect(api).toContain('checkoutMode === "GUEST"');
    expect(api).toContain('paymentTiming === "ONLINE"');
    expect(form).toContain("Guest checkout");
    expect(form).toContain("Pay online");
    expect(form).toContain("deliveryCountryCode");
    expect(settings).toContain("Guest checkout");
    expect(settings).toContain("payLaterEnabled");
    expect(paymentResult).toContain("getGuestPaymentResult");
    expect(paymentResult).toContain('eq(orders.checkoutMode, "GUEST")');
    expect(migration).toContain('CREATE TABLE "restaurant_checkout_policies"');
  });
});
