const businessDatePattern = /^\d{4}-\d{2}-\d{2}$/;

type DateParts = {
  day: number;
  hour: number;
  minute: number;
  month: number;
  second: number;
  year: number;
};

function getDateParts(value: Date, timezone: string): DateParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone: timezone,
    year: "numeric",
  }).formatToParts(value);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );

  return {
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    month: Number(values.month),
    second: Number(values.second),
    year: Number(values.year),
  };
}

function parseBusinessDate(value: string) {
  if (!businessDatePattern.test(value)) {
    throw new Error("Business date must use YYYY-MM-DD.");
  }

  const [year, month, day] = value.split("-").map(Number);
  const check = new Date(Date.UTC(year, month - 1, day));

  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    throw new Error("Business date is invalid.");
  }

  return { day, month, year };
}

function toUtcBoundary(
  date: { day: number; month: number; year: number },
  timezone: string,
) {
  const target = Date.UTC(date.year, date.month - 1, date.day);
  let candidate = target;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const observed = getDateParts(new Date(candidate), timezone);
    const observedAsUtc = Date.UTC(
      observed.year,
      observed.month - 1,
      observed.day,
      observed.hour,
      observed.minute,
      observed.second,
    );
    const difference = target - observedAsUtc;

    if (difference === 0) {
      break;
    }

    candidate += difference;
  }

  return new Date(candidate);
}

function nextCalendarDate(date: { day: number; month: number; year: number }) {
  const next = new Date(Date.UTC(date.year, date.month - 1, date.day + 1));

  return {
    day: next.getUTCDate(),
    month: next.getUTCMonth() + 1,
    year: next.getUTCFullYear(),
  };
}

export function getCurrentBusinessDate(timezone: string, now = new Date()) {
  const parts = getDateParts(now, timezone);

  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function getBusinessDateRange(value: string, timezone: string) {
  const date = parseBusinessDate(value);

  return {
    end: toUtcBoundary(nextCalendarDate(date), timezone),
    start: toUtcBoundary(date, timezone),
  };
}
