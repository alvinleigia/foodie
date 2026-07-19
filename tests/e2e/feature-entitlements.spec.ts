import { expect, test } from "@playwright/test";

import { resolveFeatureEntitlement } from "../../lib/feature-entitlements";

test.describe("feature entitlement precedence", () => {
  test("uses the restaurant override before every broader setting", () => {
    expect(
      resolveFeatureEntitlement({
        companyOverride: true,
        defaultEnabled: true,
        planEnabled: true,
        restaurantOverride: false,
      }),
    ).toEqual({
      enabled: false,
      source: "RESTAURANT_OVERRIDE",
    });
  });

  test("uses the company override when no restaurant override exists", () => {
    expect(
      resolveFeatureEntitlement({
        companyOverride: false,
        defaultEnabled: true,
        planEnabled: true,
      }),
    ).toEqual({
      enabled: false,
      source: "COMPANY_OVERRIDE",
    });
  });

  test("uses the plan entitlement before the catalogue default", () => {
    expect(
      resolveFeatureEntitlement({
        defaultEnabled: false,
        planEnabled: true,
      }),
    ).toEqual({
      enabled: true,
      source: "PLAN",
    });
  });

  test("falls back to the catalogue default when no entitlement exists", () => {
    expect(
      resolveFeatureEntitlement({
        defaultEnabled: false,
      }),
    ).toEqual({
      enabled: false,
      source: "DEFAULT",
    });
  });
});
