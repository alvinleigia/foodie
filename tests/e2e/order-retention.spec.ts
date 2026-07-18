import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

test.describe("order retention policy", () => {
  test("restaurant operations cannot hard-delete order history", () => {
    expect(
      existsSync(
        resolve(process.cwd(), "app", "api", "orders", "clear", "route.ts"),
      ),
    ).toBe(false);

    const orderBoardSource = readFileSync(
      resolve(process.cwd(), "components", "staff", "StaffOrderBoard.tsx"),
      "utf8",
    );

    expect(orderBoardSource).not.toContain("/api/orders/clear");
    expect(orderBoardSource).not.toContain("Clear All Orders");
  });
});
