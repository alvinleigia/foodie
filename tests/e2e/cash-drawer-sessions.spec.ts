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

  test("stores immutable paid-in and paid-out drawer movements", () => {
    const schemaSource = readFileSync("db/schema.ts", "utf8");
    const migrationSource = readFileSync(
      "drizzle/0051_cash_drawer_movements.sql",
      "utf8",
    );

    expect(schemaSource).toContain("cashDrawerMovements");
    expect(schemaSource).toContain('["PAID_IN", "PAID_OUT"]');
    expect(migrationSource).toContain(
      '"cash_drawer_session_id" uuid NOT NULL',
    );
    expect(migrationSource).toContain(
      'FOREIGN KEY ("cash_drawer_session_id", "organization_id")',
    );
    expect(migrationSource).toContain('CHECK ("amount" > 0)');
    expect(migrationSource).toContain(
      'CHECK (char_length(btrim("reason")) BETWEEN 1 AND 120)',
    );
    expect(migrationSource).not.toContain('"updated_at"');
  });

  test("stores one immutable reconciliation snapshot per drawer session", () => {
    const schemaSource = readFileSync("db/schema.ts", "utf8");
    const migrationSource = readFileSync(
      "drizzle/0052_cash_drawer_reconciliations.sql",
      "utf8",
    );

    expect(schemaSource).toContain("cashDrawerReconciliations");
    expect(migrationSource).toContain(
      'CREATE UNIQUE INDEX "cash_drawer_reconciliations_session_unique"',
    );
    expect(migrationSource).toContain(
      '"expected_cash_amount" = "opening_float" + "cash_sales_amount" + "paid_in_amount" - "cash_refunds_amount" - "paid_out_amount"',
    );
    expect(migrationSource).toContain(
      '"variance_amount" = "counted_cash_amount" - "expected_cash_amount"',
    );
    expect(migrationSource).not.toContain('"updated_at"');
  });

  test("attributes cash refunds to the drawer that paid them", () => {
    const schemaSource = readFileSync("db/schema.ts", "utf8");
    const migrationSource = readFileSync(
      "drizzle/0053_cash_refund_drawer_attribution.sql",
      "utf8",
    );

    expect(schemaSource).toContain(
      'name: "order_refunds_cash_drawer_session_organization_fk"',
    );
    expect(migrationSource).toContain(
      'ADD COLUMN "cash_drawer_session_id" uuid',
    );
    expect(migrationSource).toContain(
      'FOREIGN KEY ("cash_drawer_session_id", "organization_id")',
    );
    expect(migrationSource).toContain(
      'CREATE INDEX "order_refunds_cash_drawer_session_idx"',
    );
  });

  test("records manager-authorized drawer movements against an open session", () => {
    const routeSource = readFileSync(
      "app/api/cash-drawer/movements/route.ts",
      "utf8",
    );
    const serviceSource = readFileSync(
      "lib/cash-drawer-movements.ts",
      "utf8",
    );

    expect(routeSource).toContain(
      'requireStaffPermission("cash_drawer.adjust")',
    );
    expect(routeSource).toContain("getCurrentTenantContext()");
    expect(serviceSource).toContain('eq(cashDrawerSessions.status, "OPEN")');
    expect(serviceSource).toContain('.for("update")');
    expect(serviceSource).toContain("cashDrawerSessionId: openSession.id");
    expect(serviceSource).toContain("cash_drawer.movement.");
  });

  test("keeps movement reasons type-specific and exposes current-session history", () => {
    const reasonsSource = readFileSync(
      "lib/cash-drawer-movement-reasons.ts",
      "utf8",
    );
    const panelSource = readFileSync(
      "components/staff/CashDrawerPanel.tsx",
      "utf8",
    );

    expect(reasonsSource).toContain('PAID_IN: ["Float top-up"');
    expect(reasonsSource).toContain('"Supplier payment"');
    expect(panelSource).toContain("Current session history");
    expect(panelSource).toContain("canAdjust");
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

  test("exposes the drawer only through its scoped staff workspace", () => {
    const navigationSource = readFileSync("lib/staff-navigation.ts", "utf8");
    const pageSource = readFileSync(
      "app/restaurants/[restaurantSlug]/cash-drawer/page.tsx",
      "utf8",
    );

    expect(navigationSource).toContain('destination: "cashDrawer"');
    expect(navigationSource).toContain('permission: "cash_drawer.open"');
    expect(pageSource).toContain('requiredPermission: "cash_drawer.open"');
    expect(pageSource).toContain("getCashDrawerOpeningContext");
  });

  test("requires and links an open drawer when collecting cash", () => {
    const paymentSource = readFileSync("lib/staff-order-payments.ts", "utf8");

    expect(paymentSource).toContain(
      'eq(cashDrawerSessions.status, "OPEN")',
    );
    expect(paymentSource).toContain(
      '"Open the cash drawer before recording a cash payment."',
    );
    expect(paymentSource).toContain(
      "cashDrawerSessionId: drawerSession.id",
    );
  });
});
