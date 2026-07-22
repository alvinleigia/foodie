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

  test("assigns products only to active stations in the same restaurant", () => {
    const menuSource = readFileSync("lib/menu.ts", "utf8");
    const validationSource = readFileSync("lib/validations/menu.ts", "utf8");
    const adminApiSource = readFileSync("app/api/menu/admin/route.ts", "utf8");
    const managerSource = readFileSync("components/staff/MenuManager.tsx", "utf8");

    expect(validationSource).toContain("prepStationId: z");
    expect(menuSource).toContain(
      "getActivePrepStation(input.prepStationId, context)",
    );
    expect(menuSource).toContain('throw new Error("Preparation station not found.")');
    expect(adminApiSource).toContain("getPrepStations(tenantContext)");
    expect(managerSource).toContain('label="Preparation station"');
    expect(managerSource).toContain('<option value="">Unassigned</option>');
    expect(managerSource).toContain("prepStationId: itemDraft.prepStationId");
  });

  test("snapshots server-resolved routing when an order is created", () => {
    const orderSource = readFileSync("app/api/orders/route.ts", "utf8");
    const orderValidationSource = readFileSync(
      "lib/validations/order.ts",
      "utf8",
    );
    const restaurantAdminSource = readFileSync("lib/saas-admin.ts", "utf8");

    expect(orderSource).toContain(
      "const { category, inventory, item, prepStation } = await getMenuSelectionSnapshot",
    );
    expect(orderSource).toContain("prepStationId: prepStation?.id ?? null");
    expect(orderSource).toContain(
      "prepStationNameSnapshot: prepStation?.name ?? null",
    );
    expect(orderSource).toContain("prepStationId: item.prepStationId");
    expect(orderSource).toContain(
      "prepStationNameSnapshot: item.prepStationNameSnapshot",
    );
    expect(orderValidationSource).not.toContain("prepStationId");
    expect(restaurantAdminSource).toContain(
      "getDefaultPrepStationValues(restaurant.id)",
    );
  });
});
