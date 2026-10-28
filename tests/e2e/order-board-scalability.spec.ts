import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

function source(...segments: string[]) {
  return readFileSync(resolve(process.cwd(), ...segments), "utf8");
}

test.describe("staff order board scalability", () => {
  test("returns authoritative totals and paginates both order views", () => {
    const ordersSource = source("lib", "orders.ts");
    const routeSource = source("app", "api", "orders", "route.ts");

    expect(ordersSource).toContain("STAFF_ORDER_PAGE_SIZE = 20");
    expect(ordersSource).toContain("const activeTotal =");
    expect(ordersSource).toContain("const pastTotal =");
    expect(ordersSource).toContain(".limit(STAFF_ORDER_PAGE_SIZE)");
    expect(ordersSource).toContain(".offset((page - 1) * STAFF_ORDER_PAGE_SIZE)");
    expect(routeSource).toContain('searchParams.get("view")');
    expect(routeSource).toContain('.get("search")');
    expect(routeSource).toContain('.get("status")');
    expect(routeSource).toContain('"fulfilmentType"');
    expect(routeSource).toContain('.get("fromDate")');
    expect(routeSource).toContain('.get("toDate")');
    expect(routeSource).toContain("activeTotal: orderPage.activeTotal");
    expect(routeSource).toContain("pastTotal: orderPage.pastTotal");
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
    expect(boardSource).toContain("Search order, customer, email or phone");
    expect(boardSource).toContain('searchParams.set("status"');
    expect(boardSource).toContain('searchParams.set("fulfilmentType"');
    expect(boardSource).toContain('searchParams.set("fromDate"');
    expect(boardSource).toContain('searchParams.set("toDate"');
    expect(boardSource).toContain('view: activeTab');
    expect(boardSource).not.toContain("window.setInterval");
  });

  test("uses compact expandable order summaries", () => {
    const boardSource = source(
      "components",
      "staff",
      "StaffOrderBoard.tsx",
    );
    const cardSource = source("components", "staff", "OrderCard.tsx");

    expect(cardSource).toContain(
      "const [isCollapsed, setIsCollapsed] = useState(true)",
    );
    expect(cardSource).toContain("aria-expanded={!isCollapsed}");
    expect(cardSource).toContain("Show order details");
    expect(cardSource).toContain("renderSummaryPrimaryAction");
    expect(cardSource).toContain('id={`order-details-${order.orderId}`}');
    expect(boardSource).not.toContain("lg:grid-cols-2");
  });
});
