import { expect, test } from "@playwright/test";

import {
  calculateBasisPointsAmount,
  decimalToMinorUnits,
  getCurrencyMinorUnitDigits,
  minorUnitsToDecimal,
  multiplyAndRoundMinorUnits,
} from "@/lib/currency-money";
import { formatPrice } from "@/lib/formatters";

test.describe("currency monetary rounding", () => {
  test("rounds two-decimal currencies at the smallest unit", () => {
    expect(getCurrencyMinorUnitDigits("gbp")).toBe(2);
    expect(decimalToMinorUnits("10.005", "GBP")).toBe(1_001);
    expect(minorUnitsToDecimal(1_001, "GBP")).toBe("10.01");
  });

  test("supports zero-decimal currencies", () => {
    expect(getCurrencyMinorUnitDigits("JPY")).toBe(0);
    expect(decimalToMinorUnits("500.5", "JPY")).toBe(501);
    expect(minorUnitsToDecimal(501, "JPY")).toBe("501");
  });

  test("supports three-decimal currencies", () => {
    expect(getCurrencyMinorUnitDigits("KWD")).toBe(3);
    expect(decimalToMinorUnits("1.2345", "KWD")).toBe(1_235);
    expect(minorUnitsToDecimal(1_235, "KWD")).toBe("1.235");
    expect(formatPrice("1.2345", { currency: "KWD" })).toBe("KWD 1.235");
  });

  test("uses symmetric half-away-from-zero ratio rounding", () => {
    expect(multiplyAndRoundMinorUnits(5, 1, 10)).toBe(1);
    expect(multiplyAndRoundMinorUnits(-5, 1, 10)).toBe(-1);
  });

  test("uses the shared rule for basis-point amounts", () => {
    expect(calculateBasisPointsAmount(5, 1_000)).toBe(1);
    expect(calculateBasisPointsAmount(999, 1_250)).toBe(125);
  });

  test("rejects malformed or unsafe monetary inputs", () => {
    expect(() => decimalToMinorUnits("1e3", "GBP")).toThrow(
      "Order contains an invalid price.",
    );
    expect(() => minorUnitsToDecimal(Number.MAX_VALUE, "GBP")).toThrow(
      "Minor-unit amount must be a safe integer.",
    );
  });
});
