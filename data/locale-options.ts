import currencyCodes from "@/data/currencies.json";
import timezoneNames from "@/data/timezones.json";
import {
  DEFAULT_CURRENCY,
  DEFAULT_LOCALE,
  DEFAULT_TIMEZONE,
} from "@/lib/locale-defaults";

export type LocaleOption = {
  value: string;
  label: string;
};

function withDefaultValue(values: string[], defaultValue: string, variableName: string) {
  if (!values.includes(defaultValue)) {
    throw new Error(`${variableName} is not supported by this application.`);
  }

  const rest = values.filter((value) => value !== defaultValue);

  return [defaultValue, ...rest];
}

function getCurrencyName(currency: string) {
  try {
    const displayNames = new Intl.DisplayNames([DEFAULT_LOCALE], { type: "currency" });
    return displayNames.of(currency) ?? currency;
  } catch {
    return currency;
  }
}

export const timezoneValues = withDefaultValue(
  timezoneNames,
  DEFAULT_TIMEZONE,
  "NEXT_PUBLIC_DEFAULT_TIMEZONE",
);

export const currencyValues = withDefaultValue(
  currencyCodes,
  DEFAULT_CURRENCY,
  "NEXT_PUBLIC_DEFAULT_CURRENCY",
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
