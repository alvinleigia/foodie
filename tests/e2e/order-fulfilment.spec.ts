import fs from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import {
  getOrderFulfilmentLabel,
  orderFulfilmentTypes,
} from "@/lib/order-fulfilment";
import { createOrderSchema } from "@/lib/validations/order";

const root = process.cwd();

function source(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function orderRequest(fulfilmentType: string) {
  return {
    fulfilmentType,
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

test.describe("order fulfilment", () => {
  test("supports the four restaurant fulfilment types", () => {
    expect(orderFulfilmentTypes).toEqual([
      "DINE_IN",
      "TAKEAWAY",
      "COLLECTION",
      "DELIVERY",
    ]);
    expect(getOrderFulfilmentLabel("DINE_IN")).toBe("Dine-in");
    expect(getOrderFulfilmentLabel("DELIVERY")).toBe("Delivery");
  });

  test("requires a supported fulfilment type when creating an order", () => {
    for (const fulfilmentType of orderFulfilmentTypes) {
      expect(createOrderSchema.safeParse(orderRequest(fulfilmentType)).success).toBe(
        true,
      );
    }

    expect(createOrderSchema.safeParse(orderRequest("POSTAL")).success).toBe(false);
    expect(
      createOrderSchema.safeParse({
        ...orderRequest("COLLECTION"),
        fulfilmentType: undefined,
      }).success,
    ).toBe(false);
  });

  test("persists and returns fulfilment on the order API", () => {
    const api = source("app/api/orders/route.ts");
    const serializer = source("lib/orders.ts");
    const migration = source("drizzle/0047_order_fulfilment_types.sql");

    expect(api).toContain("fulfilmentType: parsed.data.fulfilmentType");
    expect(serializer).toContain("fulfilmentType: order.fulfilmentType");
    expect(migration).toContain('CREATE TYPE "order_fulfilment_type"');
    expect(migration).toContain('ADD COLUMN "fulfilment_type"');
  });

  test("sends the selected fulfilment type from order review", () => {
    const form = source("components/order/OrderForm.tsx");

    expect(form).toContain("<FulfilmentTypeSelector");
    expect(form).toContain("fulfilmentType: draft.fulfilmentType");
  });
});
