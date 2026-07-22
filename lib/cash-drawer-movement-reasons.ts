export const cashDrawerMovementReasons = {
  PAID_IN: ["Float top-up", "Cash transfer in", "Correction", "Other"],
  PAID_OUT: [
    "Petty cash",
    "Supplier payment",
    "Cash transfer out",
    "Correction",
    "Other",
  ],
} as const;

export type CashDrawerMovementType = keyof typeof cashDrawerMovementReasons;

export function isCashDrawerMovementReason(
  type: CashDrawerMovementType,
  reason: string,
) {
  return (cashDrawerMovementReasons[type] as readonly string[]).includes(reason);
}
