import currencyCodes from "@/data/currencies.json";
import timezoneNames from "@/data/timezones.json";

export type LocaleOption = {
  value: string;
  label: string;
};

const preferredTimezones = [
  "Asia/Calcutta",
  "UTC",
  "Europe/London",
  "Asia/Dubai",
  "Asia/Singapore",
  "America/New_York",
  "Australia/Sydney",
] as const;

const preferredCurrencies = ["INR", "GBP", "USD", "EUR", "AED", "SGD", "AUD"] as const;

function withPreferredValues(values: string[], preferredValues: readonly string[]) {
  const supported = new Set(values);
  const preferred = preferredValues.filter((value) => supported.has(value));
  const rest = values.filter((value) => !preferred.includes(value));

  return [...preferred, ...rest];
}

function getCurrencyName(currency: string) {
  try {
    const displayNames = new Intl.DisplayNames(["en"], { type: "currency" });
    return displayNames.of(currency) ?? currency;
  } catch {
    return currency;
  }
}

export const timezoneValues = withPreferredValues(
  timezoneNames,
  preferredTimezones,
);

export const currencyValues = withPreferredValues(
  currencyCodes,
  preferredCurrencies,
);

export const timezoneOptions: LocaleOption[] = timezoneValues.map((timezone) => ({
  value: timezone,
  label: timezone.replaceAll("_", " "),
}));

export const currencyOptions: LocaleOption[] = currencyValues.map((currency) => ({
  value: currency,
  label: `${currency} - ${getCurrencyName(currency)}`,
}));

const timezoneValueSet = new Set(timezoneValues);
const currencyValueSet = new Set(currencyValues);

export function isSupportedTimezone(timezone: string) {
  return timezoneValueSet.has(timezone);
}

export function isSupportedCurrency(currency: string) {
  return currencyValueSet.has(currency.toUpperCase());
}
