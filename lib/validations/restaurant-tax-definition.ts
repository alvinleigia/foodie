import { z } from "zod";

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

export const restaurantTaxDefinitionSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(1, "Tax code is required")
      .max(32, "Tax code is too long")
      .transform((value) => value.toUpperCase())
      .refine(
        (value) => /^[A-Z0-9][A-Z0-9_-]*$/.test(value),
        "Use letters, numbers, hyphens or underscores",
      )
      .refine((value) => value !== "DEFAULT", "DEFAULT is reserved"),
    name: z.string().trim().min(1, "Tax name is required").max(80),
    treatment: z.enum([
      "TAXABLE",
      "ZERO_RATED",
      "EXEMPT",
      "OUT_OF_SCOPE",
    ]),
    ratePercent: z.coerce.number().min(0).max(100),
    effectiveFrom: z
      .string()
      .regex(isoDatePattern, "Choose a valid effective date"),
    isCompound: z.boolean().default(false),
    calculationOrder: z.coerce.number().int().min(0).max(1000).default(0),
    isDefault: z.boolean().default(false),
    isActive: z.boolean().default(true),
  })
  .superRefine((value, context) => {
    if (value.treatment !== "TAXABLE" && value.ratePercent !== 0) {
      context.addIssue({
        code: "custom",
        message: "Zero-rated, exempt and out-of-scope taxes must use a 0% rate",
        path: ["ratePercent"],
      });
    }
  });

export type RestaurantTaxDefinitionInput = z.infer<
  typeof restaurantTaxDefinitionSchema
>;
