import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

import { deriveOrderStatusFromItems } from "@/lib/order-status";

test.describe("order final assembly", () => {
  test("adds assembly only to the order status enum", () => {
    const migrationSource = readFileSync(
      "drizzle/0055_order_assembly_status.sql",
      "utf8",
    );
    const schemaSource = readFileSync("db/schema.ts", "utf8");

    expect(migrationSource).toContain("ALTER TYPE \"order_status\"");
    expect(migrationSource).toContain("'ASSEMBLING' AFTER 'PREPARING'");
    expect(schemaSource).toContain('export const orderStatusEnum = pgEnum');
    expect(schemaSource).not.toMatch(
      /orderItemStatusEnum[\s\S]*?"ASSEMBLING"[\s\S]*?cancelledByTypeEnum/,
    );
  });

  test("derives assembly only after every open item is ready", () => {
    expect(deriveOrderStatusFromItems([])).toBe("PENDING");
    expect(deriveOrderStatusFromItems(["PENDING", "PENDING"])).toBe("PENDING");
    expect(deriveOrderStatusFromItems(["PREPARING", "READY"])).toBe(
      "PREPARING",
    );
    expect(deriveOrderStatusFromItems(["READY", "READY"])).toBe(
      "ASSEMBLING",
    );
    expect(deriveOrderStatusFromItems(["READY", "CANCELLED"])).toBe(
      "ASSEMBLING",
    );
    expect(
      deriveOrderStatusFromItems(["DELIVERED", "READY"], "READY"),
    ).toBe("READY");
    expect(deriveOrderStatusFromItems(["DELIVERED", "CANCELLED"])).toBe(
      "DELIVERED",
    );
  });

  test("requires final assembly before item handoff", () => {
    const itemRouteSource = readFileSync(
      "app/api/orders/[id]/items/[itemId]/status/route.ts",
      "utf8",
    );
    const readyRouteSource = readFileSync(
      "app/api/orders/[id]/ready/route.ts",
      "utf8",
    );

    expect(itemRouteSource).toContain(
      "The whole order must pass final assembly before handoff.",
    );
    expect(readyRouteSource).toContain(
      'lockedOrder.status === "PREPARING" ? "ASSEMBLING" : "READY"',
    );
    expect(readyRouteSource).toContain('"order.assembly_started"');
  });

  test("keeps assembly active across customer, staff, and reporting views", () => {
    const orderSource = readFileSync("lib/orders.ts", "utf8");
    const customerSource = readFileSync(
      "components/order/CustomerOrderStatus.tsx",
      "utf8",
    );
    const reportSource = readFileSync("lib/saas-reports.ts", "utf8");

    expect(orderSource).toContain('"ASSEMBLING"');
    expect(customerSource).toContain('order.status === "ASSEMBLING"');
    expect(reportSource).toContain("'ASSEMBLING'");
  });
});
