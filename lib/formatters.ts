type FormatPriceOptions = {
  currency?: string;
  emptyLabel?: string;
};

export function formatPrice(
  price: string | number | null | undefined,
  { currency = "INR", emptyLabel = "Price on request" }: FormatPriceOptions = {},
) {
  if (price === null || price === undefined || price === "") {
    return emptyLabel;
  }

  const numericPrice = Number(price);

  if (Number.isNaN(numericPrice)) {
    return emptyLabel;
  }

  return `${currency} ${numericPrice.toFixed(2)}`;
}
