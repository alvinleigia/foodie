import fs from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import {
  getEffectiveFulfilmentTime,
  validateFutureFulfilmentTime,
} from "@/lib/order-fulfilment-time";
import { createOrderSchema } from "@/lib/validations/order";

const root = process.cwd();

function source(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function orderRequest(scheduledFulfilmentAt: string | null) {
  return {
    fulfilmentType: "COLLECTION",
    scheduledFulfilmentAt,
    items: [
      {
        categoryId: "11111111-1111-4111-8111-111111111111",
        drinkId: "22222222-2222-4222-8222-222222222222",
        modifiers: [],
        notes: "",
        quantity: 1,
      },
    ],
  };
}

test.describe("order fulfilment timing", () => {
  test("accepts ASAP or an ISO scheduled time", () => {
    expect(createOrderSchema.safeParse(orderRequest(null)).success).toBe(true);
    expect(
      createOrderSchema.safeParse(
        orderRequest("2026-08-01T12:30:00.000Z"),
      ).success,
    ).toBe(true);
    expect(createOrderSchema.safeParse(orderRequest("tomorrow")).success).toBe(
      false,
    );
  });

  test("validates the scheduling window", () => {
    const now = new Date("2026-07-22T10:00:00.000Z");

    expect(
      validateFutureFulfilmentTime("2026-07-22T10:30:00.000Z", now),
    ).toBeNull();
    expect(
      validateFutureFulfilmentTime("2026-07-22T09:59:00.000Z", now),
    ).toContain("future");
    expect(
      validateFutureFulfilmentTime("2026-09-01T10:00:00.000Z", now),
    ).toContain("30 days");
  });

  test("prefers the restaurant promise over the customer request", () => {
    expect(
      getEffectiveFulfilmentTime({
        promisedFulfilmentAt: "2026-07-22T11:00:00.000Z",
        requestedFulfilmentAt: "2026-07-22T10:30:00.000Z",
      }),
    ).toEqual({ at: "2026-07-22T11:00:00.000Z", label: "Promised" });
    expect(
      getEffectiveFulfilmentTime({
        requestedFulfilmentAt: "2026-07-22T10:30:00.000Z",
      }),
    ).toEqual({ at: "2026-07-22T10:30:00.000Z", label: "Requested" });
  });

  test("persists separate customer request and staff promise fields", () => {
    const api = source("app/api/orders/route.ts");
    const staffApi = source(
      "app/api/orders/[id]/fulfilment-time/route.ts",
    );
    const migration = source("drizzle/0048_order_fulfilment_times.sql");

    expect(api).toContain('session.user.kind === "customer" ? scheduledFulfilmentAt');
    expect(api).toContain('session.user.kind === "staff" ? scheduledFulfilmentAt');
    expect(staffApi).toContain('action: "order.fulfilment_time_updated"');
    expect(migration).toContain('ADD COLUMN "requested_fulfilment_at"');
    expect(migration).toContain('ADD COLUMN "promised_fulfilment_at"');
  });
});
