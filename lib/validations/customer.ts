import { z } from "zod";

const earliestBirthDate = "1900-01-01";

export function normalizeCustomerPhone(value: string) {
  return value.trim().replace(/[\s()-]/g, "");
}

export function isValidCustomerPhone(value: string | null | undefined) {
  return Boolean(value && /^\+[1-9]\d{7,14}$/.test(normalizeCustomerPhone(value)));
}

const phoneSchema = z
  .string()
  .transform(normalizeCustomerPhone)
  .refine(isValidCustomerPhone, "Enter a valid phone number with country code");

const dateOfBirthSchema = z
  .string()
  .trim()
  .refine(
    (value) =>
      value === "" ||
      (/^\d{4}-\d{2}-\d{2}$/.test(value) &&
        value >= earliestBirthDate &&
        value <= new Date().toISOString().slice(0, 10)),
    "Enter a valid birthday",
  )
  .transform((value) => value || null);

const genderSchema = z
  .enum(["WOMAN", "MAN", "NON_BINARY", "PREFER_NOT_TO_SAY", ""])
  .transform((value) => value || null);

export const customerProfileUpdateSchema = z
  .object({
    name: z.string().trim().min(2, "Name is required").max(100).optional(),
    phone: phoneSchema.optional(),
    dateOfBirth: dateOfBirthSchema.optional(),
    gender: genderSchema.optional(),
    marketingOptIn: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "No profile changes were provided");
