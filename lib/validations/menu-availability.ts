import { z } from "zod";

import { restaurantWorkingHoursInputSchema } from "@/lib/validations/working-hours";

const periodSchema = z.object({
  closesAtMinute: z.number().int().min(0).max(1439),
  dayOfWeek: z.number().int().min(0).max(6),
  is24Hours: z.boolean(),
  opensAtMinute: z.number().int().min(0).max(1439),
});

export const menuAvailabilityScheduleSchema = z
  .object({
    name: z.string().trim().min(2, "Schedule name is required").max(80),
    isEnabled: z.boolean(),
    periods: z.array(periodSchema).max(35),
    categoryIds: z.array(z.string().uuid()).max(100).default([]),
    itemIds: z.array(z.string().uuid()).max(500).default([]),
  })
  .superRefine((value, context) => {
    const result = restaurantWorkingHoursInputSchema.safeParse({
      enabled: true,
      periods: value.periods,
    });
    if (!result.success) {
      for (const issue of result.error.issues) {
        context.addIssue({
          code: "custom",
          message: issue.message,
          path: issue.path,
        });
      }
    }
    if (new Set(value.categoryIds).size !== value.categoryIds.length) {
      context.addIssue({
        code: "custom",
        message: "Each category can be assigned only once",
        path: ["categoryIds"],
      });
    }
    if (new Set(value.itemIds).size !== value.itemIds.length) {
      context.addIssue({
        code: "custom",
        message: "Each product can be assigned only once",
        path: ["itemIds"],
      });
    }
  });
