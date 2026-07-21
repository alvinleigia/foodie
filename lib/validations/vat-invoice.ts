import { z } from "zod";

const requiredText = (label: string, max: number) =>
  z.string().trim().min(1, `${label} is required`).max(max);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .or(z.literal(""))
    .transform((value) => value || null);

const fullInvoiceCustomerSchema = z.object({
  addressLine1: requiredText("Address", 160),
  addressLine2: optionalText(160),
  city: requiredText("City", 100),
  countryCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, "Use a two-letter country code"),
  name: requiredText("Customer name", 160),
  postalCode: requiredText("Postal code", 24),
  region: optionalText(100),
});

export const vatInvoiceRequestSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("SIMPLIFIED") }),
  z.object({
    customer: fullInvoiceCustomerSchema,
    type: z.literal("FULL"),
  }),
]);

export type VatInvoiceRequest = z.infer<typeof vatInvoiceRequestSchema>;
