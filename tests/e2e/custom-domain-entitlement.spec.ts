import fs from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

function readSource(...parts: string[]) {
  return fs.readFileSync(path.join(process.cwd(), ...parts), "utf8");
}

test.describe("custom-domain entitlement", () => {
  test("preserves platform subdomains while identifying custom hosts", () => {
    const source = readSource("lib", "deployment-domain.ts");

    expect(source).toContain("isPlatformManagedTenantDomain");
    expect(source).toContain("domain.endsWith(`.${ROOT_DOMAIN}`)");
  });

  test("gates custom-domain management but permits cleanup", () => {
    const serviceSource = readSource("lib", "saas-admin.ts");
    const createRouteSource = readSource(
      "app",
      "api",
      "platform",
      "companies",
      "[id]",
      "domains",
      "route.ts",
    );
    const updateRouteSource = readSource(
      "app",
      "api",
      "platform",
      "companies",
      "[id]",
      "domains",
      "[domainId]",
      "route.ts",
    );

    expect(serviceSource).toContain('"branding.custom_domains"');
    expect(serviceSource).toContain(
      "parsed.isActive === true || parsed.isPrimary === true",
    );
    expect(createRouteSource).toContain("FeatureEntitlementError");
    expect(createRouteSource).toContain("status: 403");
    expect(updateRouteSource).toContain("FeatureEntitlementError");
    expect(updateRouteSource).toContain("status: 403");
  });

  test("rejects public resolution when custom-domain access is disabled", () => {
    const resolverSource = readSource("lib", "tenant-domains.ts");
    const pageSource = readSource(
      "app",
      "platform",
      "companies",
      "[id]",
      "domains",
      "page.tsx",
    );

    expect(resolverSource).toContain("canUseTenantDomain");
    expect(resolverSource).toContain('"branding.custom_domains"');
    expect(pageSource).toContain("companyCustomDomainsEnabled");
    expect(pageSource).toContain("customDomainsEnabled");
  });
});
