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
    ...(fulfilmentType === "DELIVERY"
      ? {
          deliveryAddress: {
            line1: "10 High Street",
            line2: "",
            city: "London",
            region: "Greater London",
            postalCode: "SW1A 1AA",
            countryCode: "GB",
            instructions: "Ring the bell",
          },
        }
      : {}),
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
  test("supports the three restaurant fulfilment types", () => {
    expect(orderFulfilmentTypes).toEqual(["DINE_IN", "PICKUP", "DELIVERY"]);
    expect(getOrderFulfilmentLabel("DINE_IN")).toBe("Dine-in");
    expect(getOrderFulfilmentLabel("PICKUP")).toBe("Takeaway");
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
        ...orderRequest("PICKUP"),
        fulfilmentType: undefined,
      }).success,
    ).toBe(false);
  });

  test("requires an address for delivery orders only", () => {
    expect(
      createOrderSchema.safeParse({
        ...orderRequest("DELIVERY"),
        deliveryAddress: undefined,
      }).success,
    ).toBe(false);
    expect(createOrderSchema.safeParse(orderRequest("PICKUP")).success).toBe(true);
    expect(createOrderSchema.safeParse(orderRequest("DINE_IN")).success).toBe(true);
  });

  test("persists and returns fulfilment on the order API", () => {
    const api = source("app/api/orders/route.ts");
    const serializer = source("lib/orders.ts");
    const foundationMigration = source("drizzle/0047_order_fulfilment_types.sql");
    const consolidationMigration = source(
      "drizzle/0062_streamline_order_fulfilment.sql",
    );

    expect(api).toContain("fulfilmentType: parsed.data.fulfilmentType");
    expect(api).toContain("deliveryAddressLine1:");
    expect(serializer).toContain("fulfilmentType: order.fulfilmentType");
    expect(serializer).toContain("deliveryAddress:");
    expect(foundationMigration).toContain('CREATE TYPE "order_fulfilment_type"');
    expect(foundationMigration).toContain('ADD COLUMN "fulfilment_type"');
    expect(consolidationMigration).toContain("'PICKUP'");
    expect(consolidationMigration).toContain('ADD COLUMN "delivery_address_line_1"');
    expect(consolidationMigration).toContain(
      'DROP TYPE "order_fulfilment_type_legacy"',
    );
  });

  test("sends the selected fulfilment type from order review", () => {
    const form = source("components/order/OrderForm.tsx");

    expect(form).toContain("<FulfilmentTypeSelector");
    expect(form).toContain("fulfilmentType: draft.fulfilmentType");
    expect(form).toContain('draft.fulfilmentType === "DELIVERY"');
    expect(form).toContain("deliveryAddress:");
  });
});
