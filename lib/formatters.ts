import { DEFAULT_CURRENCY } from "@/lib/locale-defaults";
import {
  decimalToMinorUnits,
  minorUnitsToDecimal,
} from "@/lib/currency-money";

type FormatPriceOptions = {
  currency?: string;
  emptyLabel?: string;
};

export function formatPrice(
  price: string | number | null | undefined,
  { currency = DEFAULT_CURRENCY, emptyLabel = "Price on request" }: FormatPriceOptions = {},
) {
  if (price === null || price === undefined || price === "") {
    return emptyLabel;
  }

  try {
    const amountMinor = decimalToMinorUnits(String(price), currency);

    return `${currency} ${minorUnitsToDecimal(amountMinor, currency)}`;
  } catch {
    return emptyLabel;
  }
}
