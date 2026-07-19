export type TaxPricingMode = "INCLUSIVE" | "EXCLUSIVE";

export type TaxPricing = {
  listedAmountMinor: number;
  taxableAmountMinor: number;
  taxAmountMinor: number;
  totalAmountMinor: number;
};

export function calculateTaxPricing(
  listedAmountMinor: number,
  taxRateBps: number,
  pricingMode: TaxPricingMode,
): TaxPricing {
  if (!Number.isInteger(listedAmountMinor) || listedAmountMinor < 0) {
    throw new Error("Listed amount must be a non-negative minor-unit integer.");
  }

  if (!Number.isInteger(taxRateBps) || taxRateBps < 0 || taxRateBps > 10_000) {
    throw new Error("Tax rate must be between 0 and 10000 basis points.");
  }

  if (taxRateBps === 0) {
    return {
      listedAmountMinor,
      taxableAmountMinor: listedAmountMinor,
      taxAmountMinor: 0,
      totalAmountMinor: listedAmountMinor,
    };
  }

  if (pricingMode === "EXCLUSIVE") {
    const taxAmountMinor = Math.round(
      (listedAmountMinor * taxRateBps) / 10_000,
    );

    return {
      listedAmountMinor,
      taxableAmountMinor: listedAmountMinor,
      taxAmountMinor,
      totalAmountMinor: listedAmountMinor + taxAmountMinor,
    };
  }

  const taxAmountMinor = Math.round(
    (listedAmountMinor * taxRateBps) / (10_000 + taxRateBps),
  );

  return {
    listedAmountMinor,
    taxableAmountMinor: listedAmountMinor - taxAmountMinor,
    taxAmountMinor,
    totalAmountMinor: listedAmountMinor,
  };
}
