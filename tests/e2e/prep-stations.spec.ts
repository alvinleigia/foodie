import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

test.describe("prep station foundation", () => {
  test("stores restaurant-scoped kitchen and bar stations", () => {
    const schemaSource = readFileSync("db/schema.ts", "utf8");
    const migrationSource = readFileSync(
      "drizzle/0054_prep_stations.sql",
      "utf8",
    );

    expect(schemaSource).toContain("prepStationTypeEnum");
    expect(schemaSource).toContain("prepStations");
    expect(schemaSource).toContain('name: "menu_items_prep_station_organization_fk"');
    expect(schemaSource).toContain('name: "order_items_prep_station_organization_fk"');
    expect(schemaSource).toContain("prepStationNameSnapshot");
    expect(migrationSource).toContain(
      'CREATE TYPE "prep_station_type" AS ENUM (\'KITCHEN\', \'BAR\', \'OTHER\')',
    );
    expect(migrationSource).toContain(
      'CREATE UNIQUE INDEX "prep_stations_organization_slug_unique"',
    );
    expect(migrationSource).toContain(
      "SELECT \"id\", 'kitchen', 'Kitchen', 'KITCHEN', 0",
    );
    expect(migrationSource).toContain(
      "SELECT \"id\", 'bar', 'Bar', 'BAR', 1",
    );
  });

  test("keeps station routing stable on historical order items", () => {
    const schemaSource = readFileSync("db/schema.ts", "utf8");
    const migrationSource = readFileSync(
      "drizzle/0054_prep_stations.sql",
      "utf8",
    );

    expect(schemaSource).toContain("prepStationId: uuid(\"prep_station_id\")");
    expect(schemaSource).toContain(
      'prepStationNameSnapshot: text("prep_station_name_snapshot")',
    );
    expect(migrationSource).toContain(
      'CREATE INDEX "order_items_prep_station_status_idx"',
    );
    expect(migrationSource).toContain(
      'CONSTRAINT "order_items_prep_station_snapshot_check"',
    );
    expect(migrationSource).toContain("ON DELETE restrict");
  });
});
