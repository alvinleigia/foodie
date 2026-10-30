export const receiptPrintFormats = ["THERMAL_80MM", "FULL_PAGE"] as const;

export type ReceiptPrintFormat = (typeof receiptPrintFormats)[number];

export type RestaurantReceiptSettings = {
  footerMessage: string | null;
  printFormat: ReceiptPrintFormat;
};

export const receiptPrintFormatLabels: Record<ReceiptPrintFormat, string> = {
  THERMAL_80MM: "80 mm thermal",
  FULL_PAGE: "Full page",
};
