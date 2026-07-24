import { multiplyAndRoundMinorUnits } from "@/lib/currency-money";

export type TaxPricingMode = "INCLUSIVE" | "EXCLUSIVE";

export type TaxTreatment =
  | "TAXABLE"
  | "ZERO_RATED"
  | "EXEMPT"
  | "OUT_OF_SCOPE";

export type TaxComponentInput = {
  calculationOrder: number;
  code: string;
  definitionId: string | null;
  isCompound: boolean;
  name: string;
  rateBps: number;
  treatment: TaxTreatment;
};

export type TaxComponentPricing = TaxComponentInput & {
  taxAmountMinor: number;
  taxableAmountMinor: number;
};

export type TaxPricing = {
  listedAmountMinor: number;
  taxableAmountMinor: number;
  taxAmountMinor: number;
  totalAmountMinor: number;
};

export type MultiTaxPricing = TaxPricing & {
  components: TaxComponentPricing[];
};

function validateTaxComponent(component: TaxComponentInput) {
  if (!component.code.trim() || !component.name.trim()) {
    throw new Error("Tax components need a code and name.");
  }

  if (
    !Number.isInteger(component.rateBps) ||
    component.rateBps < 0 ||
    component.rateBps > 10_000
  ) {
    throw new Error("Tax component rates must be between 0 and 10000 basis points.");
  }

  if (!Number.isInteger(component.calculationOrder) || component.calculationOrder < 0) {
    throw new Error("Tax component calculation order must be a non-negative integer.");
  }
}

function sortTaxComponents(components: TaxComponentInput[]) {
  const codes = new Set<string>();

  return [...components]
    .map((component) => {
      validateTaxComponent(component);
      const code = component.code.trim().toUpperCase();

      if (codes.has(code)) {
        throw new Error(`Tax component ${code} is assigned more than once.`);
      }

      codes.add(code);
      return {
        ...component,
        code,
        name: component.name.trim(),
      };
    })
    .sort(
      (left, right) =>
        left.calculationOrder - right.calculationOrder ||
        left.code.localeCompare(right.code),
    );
}

function calculateExclusiveComponents(
  taxableAmountMinor: number,
  components: TaxComponentInput[],
) {
  let accumulatedTaxMinor = 0;

  return components.map((component) => {
    const isTaxable =
      component.treatment === "TAXABLE" ||
      component.treatment === "ZERO_RATED";
    const componentTaxableAmountMinor = isTaxable
      ? taxableAmountMinor + (component.isCompound ? accumulatedTaxMinor : 0)
      : 0;
    const taxAmountMinor = isTaxable
      ? multiplyAndRoundMinorUnits(
          componentTaxableAmountMinor,
          component.rateBps,
          10_000,
        )
      : 0;

    accumulatedTaxMinor += taxAmountMinor;
    return {
      ...component,
      taxableAmountMinor: componentTaxableAmountMinor,
      taxAmountMinor,
    };
  });
}

function getInclusiveTaxableAmount(
  listedAmountMinor: number,
  components: TaxComponentInput[],
) {
  let low = 0;
  let high = listedAmountMinor;

  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const taxes = calculateExclusiveComponents(middle, components);
    const total = middle + taxes.reduce(
      (sum, component) => sum + component.taxAmountMinor,
      0,
    );

    if (total < listedAmountMinor) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }

  const candidates = [low, Math.max(0, low - 1)];
  return candidates.reduce((best, candidate) => {
    const taxes = calculateExclusiveComponents(candidate, components);
    const difference = Math.abs(
      candidate +
        taxes.reduce((sum, component) => sum + component.taxAmountMinor, 0) -
        listedAmountMinor,
    );
    const bestTaxes = calculateExclusiveComponents(best, components);
    const bestDifference = Math.abs(
      best +
        bestTaxes.reduce((sum, component) => sum + component.taxAmountMinor, 0) -
        listedAmountMinor,
    );

    return difference < bestDifference ? candidate : best;
  }, candidates[0]);
}

export function calculateMultiTaxPricing(
  listedAmountMinor: number,
  taxComponents: TaxComponentInput[],
  pricingMode: TaxPricingMode,
): MultiTaxPricing {
  if (!Number.isInteger(listedAmountMinor) || listedAmountMinor < 0) {
    throw new Error("Listed amount must be a non-negative minor-unit integer.");
  }

  const components = sortTaxComponents(taxComponents);

  if (components.length === 0) {
    return {
      listedAmountMinor,
      taxableAmountMinor: listedAmountMinor,
      taxAmountMinor: 0,
      totalAmountMinor: listedAmountMinor,
      components: [],
    };
  }

  const hasPositiveTax = components.some(
    (component) =>
      component.treatment === "TAXABLE" && component.rateBps > 0,
  );
  const taxableAmountMinor =
    pricingMode === "INCLUSIVE" && hasPositiveTax
      ? getInclusiveTaxableAmount(listedAmountMinor, components)
      : listedAmountMinor;
  const pricedComponents = calculateExclusiveComponents(
    taxableAmountMinor,
    components,
  );
  let taxAmountMinor = pricedComponents.reduce(
    (sum, component) => sum + component.taxAmountMinor,
    0,
  );

  if (pricingMode === "INCLUSIVE" && hasPositiveTax) {
    const difference = listedAmountMinor - taxableAmountMinor - taxAmountMinor;
    const adjustmentIndex = pricedComponents.findLastIndex(
      (component) =>
        component.treatment === "TAXABLE" && component.rateBps > 0,
    );

    if (difference !== 0 && adjustmentIndex >= 0) {
      pricedComponents[adjustmentIndex] = {
        ...pricedComponents[adjustmentIndex],
        taxAmountMinor:
          pricedComponents[adjustmentIndex].taxAmountMinor + difference,
      };
      taxAmountMinor += difference;
    }
  }

  return {
    listedAmountMinor,
    taxableAmountMinor,
    taxAmountMinor,
    totalAmountMinor:
      pricingMode === "INCLUSIVE"
        ? listedAmountMinor
        : listedAmountMinor + taxAmountMinor,
    components: pricedComponents,
  };
}

export function getTaxRateSummary(components: TaxComponentInput[]) {
  const taxableComponents = components.filter(
    (component) =>
      component.treatment === "TAXABLE" ||
      component.treatment === "ZERO_RATED",
  );

  return taxableComponents.length === 1 && !taxableComponents[0].isCompound
    ? taxableComponents[0].rateBps
    : 0;
}

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
    const taxAmountMinor = multiplyAndRoundMinorUnits(
      listedAmountMinor,
      taxRateBps,
      10_000,
    );

    return {
      listedAmountMinor,
      taxableAmountMinor: listedAmountMinor,
      taxAmountMinor,
      totalAmountMinor: listedAmountMinor + taxAmountMinor,
    };
  }

  const taxAmountMinor = multiplyAndRoundMinorUnits(
    listedAmountMinor,
    taxRateBps,
    10_000 + taxRateBps,
  );

  return {
    listedAmountMinor,
    taxableAmountMinor: listedAmountMinor - taxAmountMinor,
    taxAmountMinor,
    totalAmountMinor: listedAmountMinor,
  };
}
