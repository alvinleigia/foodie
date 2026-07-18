import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

import {
  OrderTransitionConflictError,
  requireOrderTransitionResult,
} from "@/lib/order-transition";

function readSource(...segments: string[]) {
  return readFileSync(resolve(process.cwd(), ...segments), "utf8");
}

test.describe("order status concurrency policy", () => {
  test("turns a lost compare-and-set into a transition conflict", () => {
    const order = { id: "order-1" };

    expect(requireOrderTransitionResult(order)).toBe(order);
    expect(() => requireOrderTransitionResult(undefined)).toThrow(
      OrderTransitionConflictError,
    );
  });

  test("serializes order-level transitions and compares the original status", () => {
    const routeNames = ["start", "ready", "deliver", "correct"];

    for (const routeName of routeNames) {
      const source = readSource(
        "app",
        "api",
        "orders",
        "[id]",
        routeName,
        "route.ts",
      );

      expect(source).toContain('.for("update")');
      expect(source).toContain("eq(orders.status, lockedOrder.status)");
      expect(source).toContain("requireOrderTransitionResult");
    }

    const announceSource = readSource(
      "app",
      "api",
      "orders",
      "[id]",
      "announce",
      "route.ts",
    );

    expect(announceSource).toContain("eq(orders.status, order.status)");
    expect(announceSource).toContain("requireOrderTransitionResult");
  });

  test("serializes item transitions and compares both snapshots", () => {
    const routeNames = ["status", "correct"];

    for (const routeName of routeNames) {
      const source = readSource(
        "app",
        "api",
        "orders",
        "[id]",
        "items",
        "[itemId]",
        routeName,
        "route.ts",
      );

      expect(source).toContain('.for("update")');
      expect(source).toContain("eq(orderItems.status, lockedItem.status)");
      expect(source).toContain("eq(orders.status, lockedOrder.status)");
      expect(source).toContain("requireOrderTransitionResult");
    }
  });

  test("uses exact status claims for cancellation and payment expiry", () => {
    const cancellationSource = readSource("lib", "order-cancellation.ts");
    const paymentSource = readSource("lib", "order-payments.ts");

    expect(cancellationSource).toContain('.for("update")');
    expect(cancellationSource).toContain("eq(orders.status, order.status)");
    expect(paymentSource).toContain('eq(orders.status, "PENDING")');
    expect(paymentSource).toContain('eq(orderItems.status, "PENDING")');
  });
});
