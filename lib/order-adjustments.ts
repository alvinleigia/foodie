export const orderAdjustmentTypes = [
  "DISCOUNT",
  "COMP",
  "SERVICE_CHARGE",
  "TIP",
] as const;

export const orderAdjustmentScopes = ["ORDER", "ITEM"] as const;
export const orderAdjustmentCalculations = [
  "FIXED_AMOUNT",
  "PERCENTAGE",
] as const;
export const orderAdjustmentEntryKinds = ["APPLY", "REVERSAL"] as const;
export const orderAdjustmentActorTypes = ["CUSTOMER", "STAFF", "SYSTEM"] as const;

export type OrderAdjustmentType = (typeof orderAdjustmentTypes)[number];
export type OrderAdjustmentScope = (typeof orderAdjustmentScopes)[number];
export type OrderAdjustmentCalculation =
  (typeof orderAdjustmentCalculations)[number];
export type OrderAdjustmentEntryKind =
  (typeof orderAdjustmentEntryKinds)[number];
export type OrderAdjustmentActorType =
  (typeof orderAdjustmentActorTypes)[number];

export const staffOrderAdjustmentReasonCodes = [
  "PROMOTION",
  "LOYALTY",
  "SERVICE_RECOVERY",
  "STAFF_MEAL",
  "MANAGER_COMP",
  "OTHER",
] as const;

export type StaffOrderAdjustmentReasonCode =
  (typeof staffOrderAdjustmentReasonCodes)[number];

export const staffOrderAdjustmentReasonLabels: Record<
  StaffOrderAdjustmentReasonCode,
  string
> = {
  LOYALTY: "Loyalty",
  MANAGER_COMP: "Manager comp",
  OTHER: "Other",
  PROMOTION: "Promotion",
  SERVICE_RECOVERY: "Service recovery",
  STAFF_MEAL: "Staff meal",
};

type DiscountAdjustment = {
  amountMinor: number;
  calculation: Extract<OrderAdjustmentCalculation, "FIXED_AMOUNT" | "PERCENTAGE">;
  rateBps: number | null;
  type: Extract<OrderAdjustmentType, "DISCOUNT" | "COMP">;
};

export function calculateDiscountedOrderFinancials(input: {
  adjustment: DiscountAdjustment | null;
  subtotalAmountMinor: number;
  taxAmountMinor: number;
}) {
  const { adjustment, subtotalAmountMinor, taxAmountMinor } = input;

  if (
    !Number.isInteger(subtotalAmountMinor) ||
    subtotalAmountMinor < 0 ||
    !Number.isInteger(taxAmountMinor) ||
    taxAmountMinor < 0
  ) {
    throw new Error("Order totals must be non-negative minor-unit integers.");
  }

  if (!adjustment) {
    return { discountAmountMinor: 0, taxAmountMinor };
  }

  if (
    !Number.isInteger(adjustment.amountMinor) ||
    adjustment.amountMinor <= 0 ||
    adjustment.amountMinor > subtotalAmountMinor
  ) {
    throw new Error("The adjustment exceeds the order subtotal.");
  }

  const rateBps =
    adjustment.type === "COMP"
      ? 10_000
      : adjustment.calculation === "PERCENTAGE"
        ? adjustment.rateBps
        : null;

  if (
    adjustment.calculation === "PERCENTAGE" &&
    (rateBps === null || rateBps <= 0 || rateBps > 10_000)
  ) {
    throw new Error("The adjustment percentage is invalid.");
  }

  const taxDiscountMinor =
    adjustment.calculation === "FIXED_AMOUNT"
      ? Math.round(
          (taxAmountMinor * adjustment.amountMinor) / subtotalAmountMinor,
        )
      : Math.round((taxAmountMinor * (rateBps ?? 0)) / 10_000);

  return {
    discountAmountMinor: adjustment.amountMinor,
    taxAmountMinor: Math.max(taxAmountMinor - taxDiscountMinor, 0),
  };
}

export function findActiveDiscountAdjustment<
  T extends {
    entryKind: OrderAdjustmentEntryKind;
    id: string;
    reversesAdjustmentId: string | null;
    type: OrderAdjustmentType;
  },
>(rows: T[]) {
  const reversedIds = new Set(
    rows
      .filter((row) => row.entryKind === "REVERSAL")
      .map((row) => row.reversesAdjustmentId)
      .filter((id): id is string => Boolean(id)),
  );

  return (
    rows.find(
      (row) =>
        row.entryKind === "APPLY" &&
        (row.type === "DISCOUNT" || row.type === "COMP") &&
        !reversedIds.has(row.id),
    ) ?? null
  );
}

const subtractiveAdjustmentTypes = new Set<OrderAdjustmentType>([
  "DISCOUNT",
  "COMP",
]);

export function getOrderAdjustmentEffectMinor(input: {
  amountMinor: number;
  entryKind: OrderAdjustmentEntryKind;
  type: OrderAdjustmentType;
}) {
  if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) {
    throw new Error("Adjustment amount must be a positive minor-unit integer.");
  }

  const appliedSign = subtractiveAdjustmentTypes.has(input.type) ? -1 : 1;
  const entrySign = input.entryKind === "REVERSAL" ? -1 : 1;

  return input.amountMinor * appliedSign * entrySign;
}
