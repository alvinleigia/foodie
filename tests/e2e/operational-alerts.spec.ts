import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

function source(...segments: string[]) {
  return readFileSync(resolve(process.cwd(), ...segments), "utf8");
}

test.describe("Operational alerts", () => {
  test("keeps test delivery restricted to platform administrators", () => {
    const routeSource = source(
      "app",
      "api",
      "platform",
      "operational-alerts",
      "test",
      "route.ts",
    );

    expect(routeSource).toContain("requireRole(platformAdminRoles)");
    expect(routeSource).toContain("platform.operational_alert.test");
    expect(routeSource).toContain("sendOperationalAlertTest");
  });

  test("exposes a test action without returning alert credentials", () => {
    const panelSource = source(
      "components",
      "admin",
      "PlatformDashboardPanel.tsx",
    );
    const routeSource = source(
      "app",
      "api",
      "platform",
      "operational-alerts",
      "test",
      "route.ts",
    );

    expect(panelSource).toContain("Send test alert");
    expect(panelSource).toContain("/api/platform/operational-alerts/test");
    expect(routeSource).toContain("{ sent: true }");
    expect(routeSource).not.toContain("OPERATIONAL_ALERT_EMAIL");
    expect(routeSource).not.toContain("SMTP2GO_API_KEY");
  });
});
