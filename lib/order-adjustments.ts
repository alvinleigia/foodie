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
