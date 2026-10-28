import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

import {
  getBusinessDateRange,
  getCurrentBusinessDate,
} from "@/lib/business-date";
import { aggregateCashActivityTotals } from "@/lib/cash-drawer-close-report-calculations";

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

  test("does not count carried-forward drawer balances as new daily cash", () => {
    const totals = aggregateCashActivityTotals([
      {
        cashRefundsAmount: "0.00",
        cashSalesAmount: "0.00",
        currency: "GBP",
        paidInAmount: "0.00",
        paidOutAmount: "0.00",
        varianceAmount: "0.00",
      },
      {
        cashRefundsAmount: "0.00",
        cashSalesAmount: "0.00",
        currency: "GBP",
        paidInAmount: "0.00",
        paidOutAmount: "0.00",
        varianceAmount: "0.00",
      },
      {
        cashRefundsAmount: "0.00",
        cashSalesAmount: "123.92",
        currency: "GBP",
        paidInAmount: "0.00",
        paidOutAmount: "0.00",
        varianceAmount: "0.00",
      },
      {
        cashRefundsAmount: "0.00",
        cashSalesAmount: "0.00",
        currency: "GBP",
        paidInAmount: "100.00",
        paidOutAmount: "100.00",
        varianceAmount: "0.00",
      },
    ]);

    expect(totals).toEqual([
      {
        cashRefundsAmount: "0.00",
        cashSalesAmount: "123.92",
        currency: "GBP",
        netCashMovementAmount: "123.92",
        paidInAmount: "100.00",
        paidOutAmount: "100.00",
        varianceAmount: "0.00",
      },
    ]);
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
    expect(serviceSource).toContain("cashDrawerMovements");
    expect(serviceSource).toContain("orderPayments.cashDrawerSessionId");
    expect(serviceSource).toContain("orderRefunds.cashDrawerSessionId");
    expect(serviceSource).toContain("cashActivityTotals");
    expect(serviceSource).toContain("isReadyToClose: openDrawers.length === 0");
    expect(serviceSource).toContain("exportCashDrawerCloseReportCsv");
  });

  test("shows a permission-gated manager close workspace with CSV export", () => {
    const pageSource = readFileSync(
      "app/restaurants/[restaurantSlug]/cash-drawer/page.tsx",
      "utf8",
    );
    const componentSource = readFileSync(
      "components/staff/CashDrawerCloseReportsPanel.tsx",
      "utf8",
    );

    expect(pageSource).toContain('includes("reports.view")');
    expect(pageSource).toContain("getCashDrawerCloseReport");
    expect(pageSource).toContain("CashDrawerCloseReportsPanel");
    expect(componentSource).toContain("Cash drawer reports");
    expect(componentSource).toContain("Ready to close");
    expect(componentSource).toContain("Close ${report.openDrawers.length} open drawer");
    expect(componentSource).toContain("/api/cash-drawer/reports?date=");
    expect(componentSource).toContain("&format=csv");
    expect(componentSource).toContain("Daily cash activity");
    expect(componentSource).toContain("Drawer sessions");
    expect(componentSource).toContain("Session ledger");
  });
});
