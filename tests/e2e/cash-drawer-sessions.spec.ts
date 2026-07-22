import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

import {
  CashDrawerSessionError,
  normalizeOpeningFloat,
} from "@/lib/cash-drawer-sessions";

test.describe("cash drawer session foundation", () => {
  test("stores opening floats per restaurant ordering point", () => {
    const schemaSource = readFileSync("db/schema.ts", "utf8");
    const migrationSource = readFileSync(
      "drizzle/0050_cash_drawer_sessions.sql",
      "utf8",
    );

    expect(schemaSource).toContain("cashDrawerSessions");
    expect(schemaSource).toContain("openingFloat");
    expect(schemaSource).toContain("cashDrawerSessionId");
    expect(migrationSource).toContain(
      'CREATE UNIQUE INDEX "cash_drawer_sessions_ordering_point_open_unique"',
    );
    expect(migrationSource).toContain('WHERE "status" = \'OPEN\'');
    expect(migrationSource).toContain(
      'ADD COLUMN "cash_drawer_session_id" uuid',
    );
  });

  test("normalizes the opening float in restaurant currency units", () => {
    expect(normalizeOpeningFloat("25", "GBP")).toBe("25.00");
    expect(normalizeOpeningFloat("501", "JPY")).toBe("501");
    expect(() => normalizeOpeningFloat("-1", "GBP")).toThrow(
      CashDrawerSessionError,
    );
  });

  test("protects the opening API with restaurant-scoped permission checks", () => {
    const routeSource = readFileSync(
      "app/api/cash-drawer/sessions/route.ts",
      "utf8",
    );
    const serviceSource = readFileSync("lib/cash-drawer-sessions.ts", "utf8");

    expect(routeSource).toContain(
      'requireStaffPermission("cash_drawer.open")',
    );
    expect(routeSource).toContain("getCurrentTenantContext()");
    expect(serviceSource).toContain(
      "eq(orderingPoints.organizationId, input.organizationId)",
    );
    expect(serviceSource).toContain(
      '"This ordering point already has an open cash drawer."',
    );
  });
});
