import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

function source(...segments: string[]) {
  return readFileSync(resolve(process.cwd(), ...segments), "utf8");
}

const rateLimitedSources = [
  ["lib", "manager-approval.ts"],
  ["lib", "staff-auth.ts"],
  ["app", "api", "password-reset", "route.ts"],
  ["app", "api", "invitations", "accept", "route.ts"],
  ["app", "api", "customer", "phone-verification", "start", "route.ts"],
  ["app", "api", "customer", "phone-verification", "check", "route.ts"],
  ["app", "api", "customer", "auth", "request-code", "route.ts"],
  ["app", "api", "customer", "auth", "oauth-context", "route.ts"],
  ["app", "api", "orders", "route.ts"],
  ["app", "api", "orders", "status", "route.ts"],
  ["app", "api", "orders", "[id]", "cancel", "route.ts"],
];

test.describe("shared rate limiting", () => {
  test("uses an atomic PostgreSQL window instead of process memory", () => {
    const limiterSource = source("lib", "rate-limit.ts");
    const migrationSource = source("drizzle", "0056_shared_rate_limits.sql");

    expect(limiterSource).toContain('createHmac("sha256"');
    expect(limiterSource).toContain("ON CONFLICT");
    expect(limiterSource).toContain("least(");
    expect(limiterSource).not.toContain("new Map");
    expect(migrationSource).toContain('CREATE TABLE IF NOT EXISTS "rate_limit_windows"');
    expect(migrationSource).toContain('PRIMARY KEY NOT NULL');
  });

  test("awaits every shared rate-limit check", () => {
    for (const pathSegments of rateLimitedSources) {
      const routeSource = source(...pathSegments);
      const checks = routeSource.match(/checkRateLimit\(/g) ?? [];
      const awaitedChecks = routeSource.match(/await checkRateLimit\(/g) ?? [];

      expect(checks.length, pathSegments.join("/")).toBeGreaterThan(0);
      expect(awaitedChecks.length, pathSegments.join("/")).toBe(checks.length);
    }
  });
});
