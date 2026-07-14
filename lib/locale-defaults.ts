function requirePublicEnvironmentVariable(name: string, value: string | undefined) {
  const normalized = value?.trim();

  if (!normalized) {
    throw new Error(`${name} is required for this deployment cell.`);
  }

  return normalized;
}

function resolveLocale(value: string | undefined) {
  const locale = requirePublicEnvironmentVariable("NEXT_PUBLIC_DEFAULT_LOCALE", value);

  try {
    new Intl.DateTimeFormat(locale);
  } catch {
    throw new Error("NEXT_PUBLIC_DEFAULT_LOCALE must be a valid BCP 47 locale.");
  }

  return locale;
}

function resolveCurrency(value: string | undefined) {
  const currency = requirePublicEnvironmentVariable(
    "NEXT_PUBLIC_DEFAULT_CURRENCY",
    value,
  ).toUpperCase();

  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error("NEXT_PUBLIC_DEFAULT_CURRENCY must be a three-letter currency code.");
  }

  return currency;
}

function resolveTimezone(value: string | undefined, locale: string) {
  const timezone = requirePublicEnvironmentVariable(
    "NEXT_PUBLIC_DEFAULT_TIMEZONE",
    value,
  );

  try {
    new Intl.DateTimeFormat(locale, { timeZone: timezone });
  } catch {
    throw new Error("NEXT_PUBLIC_DEFAULT_TIMEZONE must be a valid IANA timezone.");
  }

  return timezone;
}

export const DEFAULT_LOCALE = resolveLocale(process.env.NEXT_PUBLIC_DEFAULT_LOCALE);
export const DEFAULT_CURRENCY = resolveCurrency(
  process.env.NEXT_PUBLIC_DEFAULT_CURRENCY,
);
export const DEFAULT_TIMEZONE = resolveTimezone(
  process.env.NEXT_PUBLIC_DEFAULT_TIMEZONE,
  DEFAULT_LOCALE,
);
