import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

import { restaurantTaxProfileSchema } from "@/lib/validations/restaurant-tax-profile";

function readSource(...segments: string[]) {
  return readFileSync(resolve(process.cwd(), ...segments), "utf8");
}

test.describe("restaurant tax profiles", () => {
  test("requires a zero rate when no tax system is configured", () => {
    const result = restaurantTaxProfileSchema.safeParse({
      taxSystem: "NONE",
      registrationStatus: "NOT_REGISTERED",
      defaultTaxRatePercent: 20,
    });

    expect(result.success).toBe(false);
  });

  test("requires legal and registration details for registered restaurants", () => {
    const result = restaurantTaxProfileSchema.safeParse({
      taxSystem: "VAT",
      registrationStatus: "REGISTERED",
      defaultTaxRatePercent: 20,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.registrationNumber).toBeTruthy();
      expect(result.error.flatten().fieldErrors.legalName).toBeTruthy();
      expect(result.error.flatten().fieldErrors.addressLine1).toBeTruthy();
    }
  });

  test("accepts and normalizes a complete VAT profile", () => {
    const profile = restaurantTaxProfileSchema.parse({
      taxSystem: "VAT",
      registrationStatus: "REGISTERED",
      registrationNumber: "GB123456789",
      legalName: "Example Restaurant Limited",
      addressLine1: "1 High Street",
      addressLine2: "",
      city: "London",
      region: "",
      postalCode: "SW1A 1AA",
      countryCode: "gb",
      defaultTaxRatePercent: "20",
    });

    expect(profile.countryCode).toBe("GB");
    expect(profile.defaultTaxRatePercent).toBe(20);
    expect(profile.addressLine2).toBeNull();
  });

  test("wires restaurant-scoped persistence into both manager surfaces", () => {
    const schemaSource = readSource("db", "schema.ts");
    const serviceSource = readSource("lib", "restaurant-tax-profile.ts");
    const tenantRouteSource = readSource(
      "app",
      "api",
      "tenant",
      "admin",
      "tax-profile",
      "route.ts",
    );
    const companyRouteSource = readSource(
      "app",
      "api",
      "company",
      "restaurants",
      "[id]",
      "tax-profile",
      "route.ts",
    );

    expect(schemaSource).toContain("organizationTaxProfiles");
    expect(serviceSource).toContain("eq(organizations.type, \"RESTAURANT\")");
    expect(serviceSource).toContain(
      "eq(organizations.parentOrganizationId, companyOrganizationId)",
    );
    expect(tenantRouteSource).toContain("updateRestaurantTaxProfile");
    expect(companyRouteSource).toContain("updateRestaurantTaxProfile");
    expect(companyRouteSource).toContain("session.user.organizationId");
  });
});
