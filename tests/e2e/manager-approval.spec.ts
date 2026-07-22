import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

function readSource(...segments: string[]) {
  return readFileSync(resolve(process.cwd(), ...segments), "utf8");
}

test.describe("manager approval controls", () => {
  test("scopes credential approval to an active manager in the restaurant", () => {
    const source = readSource("lib", "manager-approval.ts");

    expect(source).toContain('input.actor.role === "RESTAURANT_MANAGER"');
    expect(source).toContain("eq(memberships.organizationId, input.organizationId)");
    expect(source).toContain('eq(memberships.role, "RESTAURANT_MANAGER")');
    expect(source).toContain("eq(memberships.isActive, true)");
    expect(source).toContain('eq(users.status, "ACTIVE")');
    expect(source).toContain("verifyPassword(password, manager.passwordHash)");
    expect(source).toContain("manager-approval:");
  });

  test("requires approval for staff cancellations, refunds, and adjustments", () => {
    const cancellationRoute = readSource(
      "app",
      "api",
      "orders",
      "[id]",
      "cancel",
      "route.ts",
    );
    const adjustmentRoute = readSource(
      "app",
      "api",
      "orders",
      "[id]",
      "adjustment",
      "route.ts",
    );
    const cancellationService = readSource("lib", "order-cancellation.ts");
    const adjustmentService = readSource("lib", "staff-order-adjustments.ts");

    expect(cancellationRoute).toContain("authorizeManagerAction({");
    expect(adjustmentRoute.match(/authorizeManagerAction\(\{/g)).toHaveLength(2);
    expect(cancellationService.match(/assertManagerApproval\(/g)).toHaveLength(2);
    expect(adjustmentService.match(/assertManagerApproval\(/g)).toHaveLength(2);
  });

  test("requires approval for item voids and attributes sensitive audit events", () => {
    const itemRoute = readSource(
      "app",
      "api",
      "orders",
      "[id]",
      "items",
      "[itemId]",
      "status",
      "route.ts",
    );
    const correctionRoute = readSource(
      "app",
      "api",
      "orders",
      "[id]",
      "correct",
      "route.ts",
    );

    expect(itemRoute).toContain('if (body.action === "cancel")');
    expect(itemRoute).toContain("authorizeManagerAction({");
    expect(itemRoute).toContain("approvedByUserId:");
    expect(itemRoute).toContain("approvalMode:");
    expect(correctionRoute).toContain('approvalMode: "MANAGER_SESSION"');
  });

  test("collects manager credentials only for order operators", () => {
    const boardSource = readSource(
      "components",
      "staff",
      "StaffOrderBoard.tsx",
    );
    const fieldsSource = readSource(
      "components",
      "staff",
      "ManagerApprovalFields.tsx",
    );

    expect(boardSource).toContain(
      "const managerApprovalRequired = !orders.canManageRefunds",
    );
    expect(boardSource).toContain('idPrefix="adjustment"');
    expect(boardSource).toContain('idPrefix="cancellation"');
    expect(boardSource).toContain('idPrefix="item-void"');
    expect(boardSource).toContain("!managerApprovalComplete");
    expect(fieldsSource).toContain("if (!required)");
    expect(fieldsSource).toContain('type="password"');
  });
});
