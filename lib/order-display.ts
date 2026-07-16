import { DEFAULT_LOCALE, DEFAULT_TIMEZONE } from "@/lib/locale-defaults";

type OrderDisplayInput = {
  createdAt?: string | null;
  orderDate?: string | null;
  orderNo: number;
};

function todayIsoDate() {
  const parts = new Intl.DateTimeFormat(DEFAULT_LOCALE, {
    day: "2-digit",
    month: "2-digit",
    numberingSystem: "latn",
    timeZone: DEFAULT_TIMEZONE,
    year: "numeric",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error("Unable to resolve the current deployment-cell date.");
  }

  return `${year}-${month}-${day}`;
}

export function formatOrderNumber(orderNo: number) {
  return `Order #${orderNo}`;
}

export function formatOrderDateLabel(orderDate?: string | null) {
  if (!orderDate) {
    return null;
  }

  if (orderDate === todayIsoDate()) {
    return "Today";
  }

  const parsed = new Date(`${orderDate}T00:00:00`);

  if (Number.isNaN(parsed.getTime())) {
    return orderDate;
  }

  return parsed.toLocaleDateString(DEFAULT_LOCALE, {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  });
}

export function formatOrderDisplay(input: OrderDisplayInput) {
  const dateLabel = formatOrderDateLabel(input.orderDate);

  return {
    dateLabel,
    label: formatOrderNumber(input.orderNo),
    meta:
      dateLabel ??
      (input.createdAt
        ? new Date(input.createdAt).toLocaleDateString(DEFAULT_LOCALE, {
            timeZone: DEFAULT_TIMEZONE,
          })
        : null),
  };
}
