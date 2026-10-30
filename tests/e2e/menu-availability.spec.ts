import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import { menuAvailabilityScheduleSchema } from "@/lib/validations/menu-availability";
import { isWeeklyScheduleAvailable } from "@/lib/working-hours";

const categoryId = "e3d22969-f961-43fe-90d2-d6d10e7feb8a";
const itemId = "8e3b9db9-9ce5-4b9e-9cd5-c965c5dbd91c";

test.describe("menu availability schedules", () => {
  test("evaluates weekly and overnight periods in the restaurant timezone", () => {
    const mondayBreakfast = [
      {
        dayOfWeek: 1,
        opensAtMinute: 8 * 60,
        closesAtMinute: 11 * 60,
        is24Hours: false,
      },
    ];
    expect(
      isWeeklyScheduleAvailable(
        mondayBreakfast,
        "Europe/London",
        new Date("2026-11-02T09:00:00Z"),
      ),
    ).toBe(true);
    expect(
      isWeeklyScheduleAvailable(
        mondayBreakfast,
        "Europe/London",
        new Date("2026-11-02T12:00:00Z"),
      ),
    ).toBe(false);
    expect(
      isWeeklyScheduleAvailable(
        [
          {
            dayOfWeek: 5,
            opensAtMinute: 22 * 60,
            closesAtMinute: 2 * 60,
            is24Hours: false,
          },
        ],
        "Europe/London",
        new Date("2026-11-07T01:00:00Z"),
      ),
    ).toBe(true);
  });

  test("validates assignments and rejects overlapping periods", () => {
    expect(
      menuAvailabilityScheduleSchema.safeParse({
        name: "Breakfast",
        isEnabled: true,
        periods: [
          {
            dayOfWeek: 1,
            opensAtMinute: 480,
            closesAtMinute: 660,
            is24Hours: false,
          },
        ],
        categoryIds: [categoryId],
        itemIds: [itemId],
      }).success,
    ).toBe(true);
    expect(
      menuAvailabilityScheduleSchema.safeParse({
        name: "Breakfast",
        isEnabled: true,
        periods: [
          {
            dayOfWeek: 1,
            opensAtMinute: 480,
            closesAtMinute: 660,
            is24Hours: false,
          },
          {
            dayOfWeek: 1,
            opensAtMinute: 600,
            closesAtMinute: 720,
            is24Hours: false,
          },
        ],
        categoryIds: [],
        itemIds: [],
      }).success,
    ).toBe(false);
  });

  test("stores schedules, periods and tenant-scoped assignments", () => {
    const schemaSource = readFileSync("db/schema.ts", "utf8");
    const migrationSource = readFileSync(
      "drizzle/0080_menu_availability_schedules.sql",
      "utf8",
    );
    expect(schemaSource).toContain("menuAvailabilitySchedules");
    expect(schemaSource).toContain("menuCategoryAvailabilitySchedules");
    expect(schemaSource).toContain("menuItemAvailabilitySchedules");
    expect(migrationSource).toContain(
      "menu_category_schedules_category_org_fk",
    );
    expect(migrationSource).toContain("menu_item_schedules_item_org_fk");
    expect(migrationSource).toContain(
      "menu_availability_periods_values_check",
    );
  });

  test("filters public reads and rechecks order selection", () => {
    const menuSource = readFileSync("lib/menu.ts", "utf8");
    const availabilitySource = readFileSync("lib/menu-availability.ts", "utf8");
    expect(menuSource).toContain("getMenuAvailabilityState(context)");
    expect(menuSource).toContain(
      "isMenuCategoryAvailable(category.id, availabilityState)",
    );
    expect(menuSource).toContain(
      "isMenuItemAvailable(item.categoryId, item.id, availabilityState)",
    );
    expect(availabilitySource).toContain("schedule.isEnabled");
    expect(availabilitySource).toContain("isWeeklyScheduleAvailable");
  });

  test("protects schedule routes with menu-manager access", () => {
    for (const routePath of [
      "app/api/menu/availability/route.ts",
      "app/api/menu/availability/[id]/route.ts",
    ]) {
      expect(readFileSync(routePath, "utf8")).toContain(
        "requireMenuManagerSession()",
      );
    }
  });
});
