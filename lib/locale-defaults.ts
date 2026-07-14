const LEGACY_DEFAULT_CURRENCY = "INR";
const LEGACY_DEFAULT_TIMEZONE = "Asia/Calcutta";

function resolveCurrency(value: string | undefined) {
  const currency = value?.trim().toUpperCase() || LEGACY_DEFAULT_CURRENCY;

  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error("NEXT_PUBLIC_DEFAULT_CURRENCY must be a three-letter currency code.");
  }

  return currency;
}

function resolveTimezone(value: string | undefined) {
  const timezone = value?.trim() || LEGACY_DEFAULT_TIMEZONE;

  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone });
  } catch {
    throw new Error("NEXT_PUBLIC_DEFAULT_TIMEZONE must be a valid IANA timezone.");
  }

  return timezone;
}

export const DEFAULT_CURRENCY = resolveCurrency(
  process.env.NEXT_PUBLIC_DEFAULT_CURRENCY,
);
export const DEFAULT_TIMEZONE = resolveTimezone(
  process.env.NEXT_PUBLIC_DEFAULT_TIMEZONE,
);
