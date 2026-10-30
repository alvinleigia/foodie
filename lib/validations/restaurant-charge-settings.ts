import { z } from "zod";

export const restaurantChargeSettingsSchema = z
  .object({
    serviceChargeEnabled: z.boolean(),
    serviceChargeRateBps: z.number().int().min(0).max(5000),
    serviceChargeDineIn: z.boolean(),
    serviceChargePickup: z.boolean(),
    serviceChargeDelivery: z.boolean(),
    tipsEnabled: z.boolean(),
    tipPresetsBps: z.array(z.number().int().min(1).max(5000)).length(3),
  })
  .superRefine((settings, context) => {
    const [first, second, third] = settings.tipPresetsBps;

    if (!(first < second && second < third)) {
      context.addIssue({
        code: "custom",
        message: "Tip presets must be in ascending order.",
        path: ["tipPresetsBps"],
      });
    }

    if (settings.serviceChargeEnabled && settings.serviceChargeRateBps === 0) {
      context.addIssue({
        code: "custom",
        message: "Enter a service charge percentage.",
        path: ["serviceChargeRateBps"],
      });
    }
  });
