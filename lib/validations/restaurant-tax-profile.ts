import { z } from "zod";

export const taxSystems = [
  "NONE",
  "VAT",
  "GST",
  "SALES_TAX",
  "OTHER",
] as const;

export const taxRegistrationStatuses = [
  "NOT_REGISTERED",
  "PENDING",
  "REGISTERED",
] as const;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .or(z.literal(""))
    .transform((value) => value || null);

export const restaurantTaxProfileSchema = z
  .object({
    taxSystem: z.enum(taxSystems),
    registrationStatus: z.enum(taxRegistrationStatuses),
    registrationNumber: optionalText(64),
    legalName: optionalText(160),
    addressLine1: optionalText(160),
    addressLine2: optionalText(160),
    city: optionalText(100),
    region: optionalText(100),
    postalCode: optionalText(24),
    countryCode: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}$/, "Use a two-letter country code")
      .optional()
      .or(z.literal(""))
      .transform((value) => value || null),
    defaultTaxRatePercent: z.coerce
      .number()
      .finite("Enter a valid tax rate")
      .min(0, "Tax rate cannot be below 0%")
      .max(100, "Tax rate cannot exceed 100%"),
  })
  .superRefine((profile, context) => {
    if (profile.taxSystem === "NONE") {
      if (profile.registrationStatus !== "NOT_REGISTERED") {
        context.addIssue({
          code: "custom",
          message: "Choose a tax system before changing registration status",
          path: ["registrationStatus"],
        });
      }

      if (profile.defaultTaxRatePercent !== 0) {
        context.addIssue({
          code: "custom",
          message: "A restaurant without a tax system must use a 0% default rate",
          path: ["defaultTaxRatePercent"],
        });
      }
    }

    if (
      profile.registrationStatus !== "NOT_REGISTERED" &&
      profile.taxSystem === "NONE"
    ) {
      return;
    }

    if (profile.registrationStatus !== "REGISTERED") {
      return;
    }

    const requiredFields = [
      ["registrationNumber", profile.registrationNumber, "Registration number is required"],
      ["legalName", profile.legalName, "Registered legal name is required"],
      ["addressLine1", profile.addressLine1, "Registered address is required"],
      ["city", profile.city, "City is required"],
      ["postalCode", profile.postalCode, "Postal code is required"],
      ["countryCode", profile.countryCode, "Country code is required"],
    ] as const;

    for (const [path, value, message] of requiredFields) {
      if (!value) {
        context.addIssue({ code: "custom", message, path: [path] });
      }
    }
  });

export type RestaurantTaxProfileInput = z.infer<
  typeof restaurantTaxProfileSchema
>;
