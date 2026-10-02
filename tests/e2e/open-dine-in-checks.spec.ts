import fs from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import {
  canAppendToDineInCheck,
  isOpenDineInCheck,
} from "@/lib/dine-in-checks";
import { createOrderSchema } from "@/lib/validations/order";

const root = process.cwd();

function source(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const openCheck = {
  discountAmountSnapshot: null,
  fulfilmentType: "DINE_IN",
  paymentCollectedAmount: "0",
  paymentStatus: "UNPAID",
  source: "STAFF_CREATED",
  status: "DELIVERED",
};

function appendRequest(fulfilmentType = "DINE_IN") {
  return {
    fulfilmentType,
    openDineInOrderId: "11111111-1111-4111-8111-111111111111",
    items: [
      {
        categoryId: "22222222-2222-4222-8222-222222222222",
        drinkId: "33333333-3333-4333-8333-333333333333",
        modifiers: [],
        notes: "",
        quantity: 1,
      },
    ],
  };
}

test.describe("open dine-in checks", () => {
  test("keeps a served staff dine-in check open until settlement", () => {
    expect(isOpenDineInCheck(openCheck)).toBe(true);
    expect(canAppendToDineInCheck(openCheck)).toBe(true);
    expect(isOpenDineInCheck({ ...openCheck, paymentStatus: "PAID" })).toBe(
      false,
    );
    expect(isOpenDineInCheck({ ...openCheck, fulfilmentType: "PICKUP" })).toBe(
      false,
    );
  });

  test("blocks additions after payment or an adjustment starts", () => {
    expect(
      canAppendToDineInCheck({
        ...openCheck,
        paymentCollectedAmount: "2.00",
        paymentStatus: "PARTIALLY_PAID",
      }),
    ).toBe(false);
    expect(
      canAppendToDineInCheck({
        ...openCheck,
        discountAmountSnapshot: "1.00",
      }),
    ).toBe(false);
  });

  test("only accepts appended items for dine-in", () => {
    expect(createOrderSchema.safeParse(appendRequest()).success).toBe(true);
    expect(createOrderSchema.safeParse(appendRequest("PICKUP")).success).toBe(
      false,
    );
  });

  test("locks and reopens the existing check when items are added", () => {
    const api = source("app/api/orders/route.ts");
    const orders = source("lib/orders.ts");

    expect(api).toContain(".for(\"update\")");
    expect(api).toContain("canAppendToDineInCheck(openOrder)");
    expect(api).toContain("paymentAmount: null");
    expect(api).toContain("deriveOrderStatusFromItems");
    expect(orders).toContain("openDineInCheckFilter");
    expect(orders).toContain("not(openDineInCheckFilter())");
  });

  test("offers add-items and minimize controls on the staff card", () => {
    const card = source("components/staff/OrderCard.tsx");
    const form = source("components/order/OrderForm.tsx");

    expect(card).toContain("Open check");
    expect(card).toContain("Minimize check");
    expect(card).toContain("getStaffRestaurantAddItemsHref");
    expect(form).toContain("openDineInOrderId: openDineInOrder?.id");
    expect(form).toContain("Items added to check");
  });
});
