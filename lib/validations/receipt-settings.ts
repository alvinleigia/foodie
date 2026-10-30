import { z } from "zod";

import { receiptPrintFormats } from "@/lib/receipt-settings";

export const restaurantReceiptSettingsSchema = z.object({
  footerMessage: z.string().trim().max(160).optional().default(""),
  printFormat: z.enum(receiptPrintFormats),
});
