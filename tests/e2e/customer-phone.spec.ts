import { expect, test } from "@playwright/test";

import {
  isValidCustomerPhone,
  normalizeCustomerPhone,
} from "@/lib/validations/customer";

test.describe("customer phone numbers", () => {
  test("normalizes a local number using the selected country", () => {
    expect(normalizeCustomerPhone("07123 456789", "GB")).toBe(
      "+447123456789",
    );
    expect(isValidCustomerPhone("07123 456789", "GB")).toBe(true);
  });

  test("preserves an international number when another country is selected", () => {
    expect(normalizeCustomerPhone("+91 98765 43210", "GB")).toBe(
      "+919876543210",
    );
    expect(isValidCustomerPhone("+91 98765 43210", "GB")).toBe(true);
  });

  test("rejects an incomplete local number", () => {
    expect(isValidCustomerPhone("07700", "GB")).toBe(false);
  });
});
