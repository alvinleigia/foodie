import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test.describe("cash drawer session foundation", () => {
  test("stores opening floats per restaurant ordering point", () => {
    const schemaSource = readFileSync("db/schema.ts", "utf8");
    const migrationSource = readFileSync(
      "drizzle/0050_cash_drawer_sessions.sql",
      "utf8",
    );

    expect(schemaSource).toContain("cashDrawerSessions");
    expect(schemaSource).toContain("openingFloat");
    expect(schemaSource).toContain("cashDrawerSessionId");
    expect(migrationSource).toContain(
      'CREATE UNIQUE INDEX "cash_drawer_sessions_ordering_point_open_unique"',
    );
    expect(migrationSource).toContain('WHERE "status" = \'OPEN\'');
    expect(migrationSource).toContain(
      'ADD COLUMN "cash_drawer_session_id" uuid',
    );
  });
});
