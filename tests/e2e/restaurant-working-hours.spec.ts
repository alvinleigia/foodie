import fs from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { restaurantWorkingHoursInputSchema } from "@/lib/validations/working-hours";
import {
  isRestaurantOpenForCustomerOrders,
  type RestaurantWorkingHours,
} from "@/lib/working-hours";

const root = process.cwd();

function source(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function schedule(
  periods: RestaurantWorkingHours["periods"],
): RestaurantWorkingHours {
  return {
    enabled: true,
    periods,
    timezone: "Europe/London",
  };
}

test.describe("restaurant customer ordering hours", () => {
  test("keeps legacy restaurants open until enforcement is enabled", () => {
    expect(
      isRestaurantOpenForCustomerOrders({
        enabled: false,
        periods: [],
        timezone: "Europe/London",
      }),
    ).toBe(true);
  });

  test("opens and closes at the configured local time", () => {
    const workingHours = schedule([
      {
        closesAtMinute: 17 * 60,
        dayOfWeek: 1,
        is24Hours: false,
        opensAtMinute: 9 * 60,
      },
    ]);

    expect(
      isRestaurantOpenForCustomerOrders(
        workingHours,
        new Date("2026-08-24T08:00:00.000Z"),
      ),
    ).toBe(true);
    expect(
      isRestaurantOpenForCustomerOrders(
        workingHours,
        new Date("2026-08-24T15:59:00.000Z"),
      ),
    ).toBe(true);
    expect(
      isRestaurantOpenForCustomerOrders(
        workingHours,
        new Date("2026-08-24T16:00:00.000Z"),
      ),
    ).toBe(false);
  });

  test("supports split service periods and 24-hour days", () => {
    const splitHours = schedule([
      {
        closesAtMinute: 11 * 60,
        dayOfWeek: 2,
        is24Hours: false,
        opensAtMinute: 7 * 60,
      },
      {
        closesAtMinute: 22 * 60,
        dayOfWeek: 2,
        is24Hours: false,
        opensAtMinute: 17 * 60,
      },
    ]);
    const allDay = schedule([
      {
        closesAtMinute: 0,
        dayOfWeek: 2,
        is24Hours: true,
        opensAtMinute: 0,
      },
    ]);

    expect(
      isRestaurantOpenForCustomerOrders(
        splitHours,
        new Date("2026-08-25T11:00:00.000Z"),
      ),
    ).toBe(false);
    expect(
      isRestaurantOpenForCustomerOrders(
        splitHours,
        new Date("2026-08-25T17:00:00.000Z"),
      ),
    ).toBe(true);
    expect(
      isRestaurantOpenForCustomerOrders(
        allDay,
        new Date("2026-08-25T22:59:00.000Z"),
      ),
    ).toBe(true);
  });

  test("carries overnight hours into the following day", () => {
    const workingHours = schedule([
      {
        closesAtMinute: 2 * 60,
        dayOfWeek: 5,
        is24Hours: false,
        opensAtMinute: 18 * 60,
      },
    ]);

    expect(
      isRestaurantOpenForCustomerOrders(
        workingHours,
        new Date("2026-08-28T21:00:00.000Z"),
      ),
    ).toBe(true);
    expect(
      isRestaurantOpenForCustomerOrders(
        workingHours,
        new Date("2026-08-29T00:30:00.000Z"),
      ),
    ).toBe(true);
    expect(
      isRestaurantOpenForCustomerOrders(
        workingHours,
        new Date("2026-08-29T01:00:00.000Z"),
      ),
    ).toBe(false);
  });

  test("rejects overlapping windows, including the weekly boundary", () => {
    const overlappingMonday = restaurantWorkingHoursInputSchema.safeParse({
      enabled: true,
      periods: [
        {
          closesAtMinute: 12 * 60,
          dayOfWeek: 1,
          is24Hours: false,
          opensAtMinute: 9 * 60,
        },
        {
          closesAtMinute: 13 * 60,
          dayOfWeek: 1,
          is24Hours: false,
          opensAtMinute: 11 * 60,
        },
      ],
    });
    const sundayIntoMonday = restaurantWorkingHoursInputSchema.safeParse({
      enabled: true,
      periods: [
        {
          closesAtMinute: 2 * 60,
          dayOfWeek: 0,
          is24Hours: false,
          opensAtMinute: 22 * 60,
        },
        {
          closesAtMinute: 3 * 60,
          dayOfWeek: 1,
          is24Hours: false,
          opensAtMinute: 60,
        },
      ],
    });

    expect(overlappingMonday.success).toBe(false);
    expect(sundayIntoMonday.success).toBe(false);
  });

  test("allows adjacent service windows and an intentionally closed week", () => {
    expect(
      restaurantWorkingHoursInputSchema.safeParse({
        enabled: true,
        periods: [
          {
            closesAtMinute: 12 * 60,
            dayOfWeek: 1,
            is24Hours: false,
            opensAtMinute: 9 * 60,
          },
          {
            closesAtMinute: 14 * 60,
            dayOfWeek: 1,
            is24Hours: false,
            opensAtMinute: 12 * 60,
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      restaurantWorkingHoursInputSchema.safeParse({
        enabled: true,
        periods: [],
      }).success,
    ).toBe(true);
  });

  test("persists, displays and enforces the shared restaurant schedule", () => {
    const migration = source("drizzle/0061_restaurant_working_hours.sql");
    const orderApi = source("app/api/orders/route.ts");
    const publicContext = source("lib/public-order-route-context.ts");
    const settingsPage = source(
      "app/restaurants/[restaurantSlug]/settings/page.tsx",
    );

    expect(migration).toContain('CREATE TABLE "restaurant_ordering_periods"');
    expect(orderApi).toContain("isRestaurantOpenForCustomerOrders");
    expect(orderApi).toContain("currently closed for customer orders");
    expect(publicContext).toContain('"OUTSIDE_WORKING_HOURS"');
    expect(settingsPage).toContain("RestaurantWorkingHoursForm");
  });
});
