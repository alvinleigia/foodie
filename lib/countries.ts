import {
  getCountries,
  getCountryCallingCode,
  type CountryCode,
} from "libphonenumber-js";

import { DEFAULT_LOCALE } from "@/lib/locale-defaults";

export const DEFAULT_COUNTRY_CODE: CountryCode = "GB";

const countryByCurrency: Partial<Record<string, CountryCode>> = {
  AED: "AE",
  AUD: "AU",
  CAD: "CA",
  GBP: "GB",
  INR: "IN",
  NZD: "NZ",
  SAR: "SA",
  SGD: "SG",
  USD: "US",
};

const supportedCountryCodes = getCountries();
const supportedCountryCodeSet = new Set<string>(supportedCountryCodes);

function getCountryName(countryCode: CountryCode) {
  try {
    const displayNames = new Intl.DisplayNames([DEFAULT_LOCALE], {
      type: "region",
    });

    return displayNames.of(countryCode) ?? countryCode;
  } catch {
    return countryCode;
  }
}

export const countryOptions = supportedCountryCodes
  .map((countryCode) => ({
    value: countryCode,
    label: `${getCountryName(countryCode)} (+${getCountryCallingCode(countryCode)})`,
    searchText: `${countryCode} +${getCountryCallingCode(countryCode)}`,
  }))
  .sort((left, right) => left.label.localeCompare(right.label));

export function isSupportedCountryCode(value: string): value is CountryCode {
  return supportedCountryCodeSet.has(value.toUpperCase());
}

export function getCountryCallingCodeLabel(countryCode: CountryCode) {
  return `${countryCode} +${getCountryCallingCode(countryCode)}`;
}

export function getDefaultCountryCodeForCurrency(currency: string) {
  return countryByCurrency[currency.toUpperCase()] ?? DEFAULT_COUNTRY_CODE;
}
