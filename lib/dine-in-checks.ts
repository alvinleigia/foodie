type DineInCheckCandidate = {
  discountAmountSnapshot?: string | null;
  fulfilmentType: string;
  paymentCollectedAmount?: string | null;
  paymentStatus: string;
  source: string;
  status: string;
};

export function isOpenDineInCheck(order: DineInCheckCandidate) {
  return (
    order.source === "STAFF_CREATED" &&
    order.fulfilmentType === "DINE_IN" &&
    order.status !== "CANCELLED" &&
    ["UNPAID", "PARTIALLY_PAID", "PENDING"].includes(order.paymentStatus)
  );
}

export function canAppendToDineInCheck(order: DineInCheckCandidate) {
  return (
    isOpenDineInCheck(order) &&
    order.paymentStatus === "UNPAID" &&
    Number(order.paymentCollectedAmount ?? 0) === 0 &&
    Number(order.discountAmountSnapshot ?? 0) === 0
  );
}
