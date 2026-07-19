import fs from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

function readSource(...parts: string[]) {
  return fs.readFileSync(path.join(process.cwd(), ...parts), "utf8");
}

test.describe("operational report entitlement", () => {
  test("keeps dashboard summaries while conditionally loading reports", () => {
    const tenantSummarySource = readSource(
      "app",
      "api",
      "tenant",
      "summary",
      "route.ts",
    );
    const companySummarySource = readSource(
      "app",
      "api",
      "company",
      "summary",
      "route.ts",
    );

    expect(tenantSummarySource).toContain("getRestaurantSummary");
    expect(tenantSummarySource).toContain('"reports.operational"');
    expect(tenantSummarySource).toContain("reportsEntitlement.enabled");
    expect(companySummarySource).toContain("getCompanySummary");
    expect(companySummarySource).toContain('"reports.operational"');
    expect(companySummarySource.match(/reportsEntitlement\.enabled/g)).toHaveLength(2);
  });

  test("rejects restaurant and company CSV exports when disabled", () => {
    for (const scope of ["tenant", "company"] as const) {
      const source = readSource(
        "app",
        "api",
        scope,
        "reports",
        "export",
        "route.ts",
      );

      expect(source).toContain('"reports.operational"');
      expect(source).toContain("FeatureEntitlementError");
      expect(source).toContain("status: 403");
    }
  });

  test("hides company report breakdowns with the report feature", () => {
    const source = readSource(
      "components",
      "admin",
      "CompanyRestaurantsPanel.tsx",
    );
    const reportGuard = source.indexOf("{report ? (");
    const breakdown = source.indexOf("<ReportBreakdown", reportGuard);
    const operationalReports = source.indexOf("<OperationalReports", reportGuard);

    expect(reportGuard).toBeGreaterThan(-1);
    expect(breakdown).toBeGreaterThan(reportGuard);
    expect(operationalReports).toBeGreaterThan(breakdown);
  });
});
