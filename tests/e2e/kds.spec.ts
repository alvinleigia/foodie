import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

import { getRestaurantWorkspaceHref } from "@/lib/restaurant-workspace";

test.describe("restaurant kitchen display", () => {
  test("uses a canonical restaurant-scoped route", () => {
    expect(getRestaurantWorkspaceHref("Snack Shack", "kds")).toBe(
      "/restaurants/snack%20shack/kds",
    );

    const pageSource = readFileSync(
      "app/restaurants/[restaurantSlug]/kds/page.tsx",
      "utf8",
    );
    expect(pageSource).toContain('destination: "kds"');
    expect(pageSource).toContain('requiredPermission: "orders.view"');
  });

  test("authorizes the board and item transitions independently", () => {
    const routeSource = readFileSync("app/api/orders/kds/route.ts", "utf8");
    const itemStatusSource = readFileSync(
      "app/api/orders/[id]/items/[itemId]/status/route.ts",
      "utf8",
    );

    expect(routeSource).toContain('requireStaffPermission("orders.view")');
    expect(routeSource).toContain(
      'session.user.permissions.includes("orders.update_status")',
    );
    expect(itemStatusSource).toContain(
      'requireStaffPermission("orders.update_status")',
    );
    expect(itemStatusSource).toContain("OrderTransitionConflictError");
  });

  test("only exposes routed, open preparation items", () => {
    const serviceSource = readFileSync("lib/kds.ts", "utf8");
    const orderSource = readFileSync("lib/orders.ts", "utf8");

    expect(serviceSource).toContain(
      'const openItemStatuses = new Set(["PENDING", "PREPARING", "READY"])',
    );
    expect(serviceSource).toContain("item.prepStationId");
    expect(serviceSource).toContain("item.prepStationNameSnapshot");
    expect(serviceSource).toContain("tickets.sort(");
    expect(orderSource).toContain("prepStationId: item.prepStationId");
    expect(orderSource).toContain(
      "prepStationNameSnapshot: item.prepStationNameSnapshot",
    );
  });

  test("offers preparation actions without cancellation or handoff actions", () => {
    const boardSource = readFileSync("components/staff/KdsBoard.tsx", "utf8");

    expect(boardSource).toContain('action: "start" as const');
    expect(boardSource).toContain('action: "ready" as const');
    expect(boardSource).toContain("Waiting for handoff");
    expect(boardSource).not.toContain('action: "cancel" as const');
    expect(boardSource).not.toContain('action: "deliver" as const');
  });

  test("backs off when empty and pauses polling in hidden tabs", () => {
    const boardSource = readFileSync("components/staff/KdsBoard.tsx", "utf8");

    expect(boardSource).toContain("hasTicketsRef.current ? 4_000 : 10_000");
    expect(boardSource).toContain('document.visibilityState === "hidden"');
    expect(boardSource).toContain(
      'document.addEventListener("visibilitychange", handleVisibilityChange)',
    );
  });

  test("adds the display to restaurant navigation", () => {
    const navigationSource = readFileSync("lib/staff-navigation.ts", "utf8");

    expect(navigationSource).toContain('destination: "kds"');
    expect(navigationSource).toContain('label: "Kitchen display"');
    expect(navigationSource).toContain('permission: "orders.view"');
  });
});
