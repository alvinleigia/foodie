import { DEFAULT_CURRENCY } from "@/lib/locale-defaults";
import {
  decimalToMinorUnits,
  getCurrencyMinorUnitDigits,
  getCurrencyMinorUnitFactor,
  minorUnitsToDecimal,
} from "@/lib/currency-money";

type FormatPriceOptions = {
  currency?: string;
  emptyLabel?: string;
  currencyDisplay?: "code" | "symbol";
};

export function formatPrice(
  price: string | number | null | undefined,
  { currency = DEFAULT_CURRENCY, emptyLabel = "Price on request", currencyDisplay = "code" }: FormatPriceOptions = {},
) {
  if (price === null || price === undefined || price === "") {
    return emptyLabel;
  }

  try {
    const amountMinor = decimalToMinorUnits(String(price), currency);

    if (currencyDisplay === "symbol") {
      const digits = getCurrencyMinorUnitDigits(currency);
      return new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency,
        currencyDisplay: "symbol",
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      }).format(amountMinor / getCurrencyMinorUnitFactor(currency));
    }

    return `${currency} ${minorUnitsToDecimal(amountMinor, currency)}`;
  } catch {
    return emptyLabel;
  }
}
