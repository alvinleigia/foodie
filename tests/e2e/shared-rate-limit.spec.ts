import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";
import { drizzle } from "drizzle-orm/postgres-js";

import * as schema from "@/db/schema";
import { buildRateLimitUpsert } from "@/lib/rate-limit";

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
    expect(limiterSource).toContain("onConflictDoUpdate");
    expect(limiterSource).toContain("least(");
    expect(limiterSource).not.toContain("new Map");
    expect(migrationSource).toContain('CREATE TABLE IF NOT EXISTS "rate_limit_windows"');
    expect(migrationSource).toContain('PRIMARY KEY NOT NULL');
  });

  test("generates valid unqualified insert and conflict targets", () => {
    const db = drizzle.mock({ schema });
    const query = buildRateLimitUpsert(db, {
      keyHash: "test-key",
      limit: 10,
      windowMs: 60_000,
    }).toSQL();

    expect(query.sql).toContain('insert into "rate_limit_windows"');
    expect(query.sql).toContain('on conflict ("key_hash") do update');
    expect(query.sql).not.toContain('("rate_limit_windows"."key_hash"');
    expect(query.sql).not.toContain('set "rate_limit_windows".');
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
