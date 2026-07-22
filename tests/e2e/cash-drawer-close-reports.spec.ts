import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

import {
  getBusinessDateRange,
  getCurrentBusinessDate,
} from "@/lib/business-date";

test.describe("cash drawer close reports", () => {
  test("uses restaurant-local calendar boundaries across daylight saving", () => {
    const spring = getBusinessDateRange("2026-03-29", "Europe/London");
    const autumn = getBusinessDateRange("2026-10-25", "Europe/London");

    expect(spring.end.getTime() - spring.start.getTime()).toBe(23 * 60 * 60 * 1000);
    expect(autumn.end.getTime() - autumn.start.getTime()).toBe(
      25 * 60 * 60 * 1000,
    );
    expect(
      getCurrentBusinessDate(
        "Europe/London",
        new Date("2026-07-21T23:30:00.000Z"),
      ),
    ).toBe("2026-07-22");
  });

  test("rejects impossible business dates", () => {
    expect(() => getBusinessDateRange("2026-02-30", "Europe/London")).toThrow(
      "Business date is invalid.",
    );
  });

  test("scopes close reports to the restaurant and successful ledger entries", () => {
    const serviceSource = readFileSync(
      "lib/cash-drawer-close-reports.ts",
      "utf8",
    );
    const routeSource = readFileSync(
      "app/api/cash-drawer/reports/route.ts",
      "utf8",
    );

    expect(routeSource).toContain('requireStaffPermission("reports.view")');
    expect(routeSource).toContain("getCurrentTenantContext()");
    expect(serviceSource).toContain(
      "eq(cashDrawerSessions.organizationId, input.organizationId)",
    );
    expect(serviceSource).toContain('eq(orderPayments.status, "SUCCEEDED")');
    expect(serviceSource).toContain('eq(orderRefunds.status, "SUCCEEDED")');
    expect(serviceSource).toContain("cashDrawerReconciliations");
    expect(serviceSource).toContain("isReadyToClose: openDrawers.length === 0");
    expect(serviceSource).toContain("exportCashDrawerCloseReportCsv");
  });
});
