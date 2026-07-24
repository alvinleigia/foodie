import { z } from "zod";

export const prepStationSchema = z.object({
  name: z.string().trim().min(1, "Enter a station name.").max(80),
  type: z.enum(["KITCHEN", "BAR", "OTHER"]),
  sortOrder: z.coerce.number().int().min(0).max(1000),
  isActive: z.boolean(),
});

export type PrepStationInput = z.infer<typeof prepStationSchema>;
