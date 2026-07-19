import { expect, test } from "@playwright/test";

import { resolveFeatureEntitlement } from "../../lib/feature-entitlements";
import { featureOverrideBatchSchema } from "../../lib/validations/feature-entitlements";

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

test.describe("feature override validation", () => {
  const organizationId = "11111111-1111-4111-8111-111111111111";

  test("requires a reason when access is overridden", () => {
    const result = featureOverrideBatchSchema.safeParse({
      organizationId,
      updates: [
        {
          featureKey: "payments.stripe",
          mode: "DISABLED",
          reason: "",
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  test("rejects duplicate feature updates", () => {
    const result = featureOverrideBatchSchema.safeParse({
      organizationId,
      updates: [
        {
          featureKey: "payments.stripe",
          mode: "ENABLED",
          reason: "Contract exception",
        },
        {
          featureKey: "payments.stripe",
          mode: "DISABLED",
          reason: "Support hold",
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  test("accepts a future-dated override", () => {
    const result = featureOverrideBatchSchema.safeParse({
      organizationId,
      updates: [
        {
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          featureKey: "payments.stripe",
          mode: "ENABLED",
          reason: "Temporary trial",
        },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.data?.updates[0].expiresAt).toBeInstanceOf(Date);
  });
});
