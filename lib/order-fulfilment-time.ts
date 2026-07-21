import { DEFAULT_LOCALE, DEFAULT_TIMEZONE } from "@/lib/locale-defaults";

export const MAX_FULFILMENT_SCHEDULE_DAYS = 30;

type FulfilmentTimeSource = {
  promisedFulfilmentAt?: string | Date | null;
  requestedFulfilmentAt?: string | Date | null;
};

export function getEffectiveFulfilmentTime(order: FulfilmentTimeSource) {
  if (order.promisedFulfilmentAt) {
    return {
      at: order.promisedFulfilmentAt,
      label: "Promised",
    } as const;
  }

  if (order.requestedFulfilmentAt) {
    return {
      at: order.requestedFulfilmentAt,
      label: "Requested",
    } as const;
  }

  return null;
}

export function formatOrderFulfilmentTime(
  value: string | Date,
  options: { locale?: string; timeZone?: string } = {},
) {
  return new Intl.DateTimeFormat(options.locale ?? DEFAULT_LOCALE, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: options.timeZone ?? DEFAULT_TIMEZONE,
  }).format(new Date(value));
}

export function toLocalDateTimeInputValue(value: string | Date) {
  const date = new Date(value);
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return offsetDate.toISOString().slice(0, 16);
}

export function validateFutureFulfilmentTime(
  value: string | Date,
  now = new Date(),
) {
  const scheduledAt = new Date(value);

  if (Number.isNaN(scheduledAt.getTime())) {
    return "Choose a valid fulfilment time.";
  }

  if (scheduledAt.getTime() <= now.getTime()) {
    return "Fulfilment time must be in the future.";
  }

  const latestAllowed = new Date(
    now.getTime() + MAX_FULFILMENT_SCHEDULE_DAYS * 24 * 60 * 60 * 1000,
  );

  if (scheduledAt.getTime() > latestAllowed.getTime()) {
    return `Fulfilment time cannot be more than ${MAX_FULFILMENT_SCHEDULE_DAYS} days ahead.`;
  }

  return null;
}
