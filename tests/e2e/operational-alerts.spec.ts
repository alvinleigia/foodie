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

  test("captures unhandled server errors with shared alert deduplication", () => {
    const instrumentationSource = source("instrumentation.ts");
    const alertSource = source("lib", "operational-alerts.ts");

    expect(instrumentationSource).toContain("Instrumentation.onRequestError");
    expect(instrumentationSource).toContain("reportUnhandledServerError");
    expect(instrumentationSource).toContain('NEXT_RUNTIME === "edge"');
    expect(instrumentationSource).not.toContain("request.headers");
    expect(alertSource).toContain("checkRateLimit");
    expect(alertSource).toContain("APPLICATION_ERROR_ALERT_WINDOW_MS");
    expect(alertSource).toContain("allowFallbackApplicationErrorAlert");
    expect(alertSource).toContain("application.error_alert_rate_limit_failed");
    expect(alertSource).toContain("application.error_alert_deduplicated");
    expect(alertSource).not.toContain("input.error.stack");
  });

  test("shows platform administrators the configured alert owner and coverage", () => {
    const statusRouteSource = source(
      "app",
      "api",
      "platform",
      "operational-alerts",
      "route.ts",
    );
    const panelSource = source(
      "components",
      "admin",
      "PlatformDashboardPanel.tsx",
    );
    const alertSource = source("lib", "operational-alerts.ts");

    expect(statusRouteSource).toContain("requireRole(platformAdminRoles)");
    expect(statusRouteSource).toContain("getOperationalAlertStatus");
    expect(alertSource).toContain('"UNHANDLED_SERVER_ERROR"');
    expect(panelSource).toContain("Owner: ${alertStatus.owner}");
    expect(panelSource).toContain("unhandled server errors");
  });
});
