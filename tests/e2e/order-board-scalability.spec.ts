import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

function source(...segments: string[]) {
  return readFileSync(resolve(process.cwd(), ...segments), "utf8");
}

test.describe("staff order board scalability", () => {
  test("bounds active orders and paginates history", () => {
    const ordersSource = source("lib", "orders.ts");
    const routeSource = source("app", "api", "orders", "route.ts");

    expect(ordersSource).toContain("STAFF_ACTIVE_ORDER_LIMIT = 200");
    expect(ordersSource).toContain("STAFF_ORDER_HISTORY_PAGE_SIZE = 20");
    expect(ordersSource).toContain(".limit(STAFF_ACTIVE_ORDER_LIMIT + 1)");
    expect(ordersSource).toContain(".limit(STAFF_ORDER_HISTORY_PAGE_SIZE)");
    expect(ordersSource).toContain(".offset((page - 1) * STAFF_ORDER_HISTORY_PAGE_SIZE)");
    expect(routeSource).toContain('searchParams.get("view")');
    expect(routeSource).toContain("pageInfo:");
  });

  test("polls only visible active work and loads history on demand", () => {
    const boardSource = source(
      "components",
      "staff",
      "StaffOrderBoard.tsx",
    );

    expect(boardSource).toContain('document.addEventListener("visibilitychange"');
    expect(boardSource).toContain(
      "activeOrderCountRef.current > 0 ? 4_000 : 10_000",
    );
    expect(boardSource).toContain('searchParams.set("page"');
    expect(boardSource).toContain('view: activeTab');
    expect(boardSource).not.toContain("window.setInterval");
  });
});
