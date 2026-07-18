export const orderTransitionConflictMessage =
  "The order changed while this action was being applied. Refresh and try again.";

export class OrderTransitionConflictError extends Error {
  constructor(message = orderTransitionConflictMessage) {
    super(message);
    this.name = "OrderTransitionConflictError";
  }
}

export function requireOrderTransitionResult<T>(record: T | null | undefined) {
  if (!record) {
    throw new OrderTransitionConflictError();
  }

  return record;
}
