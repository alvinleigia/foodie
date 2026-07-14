import { z } from "zod";

const optionalEmail = z
  .string()
  .trim()
  .email("Enter a valid email address")
  .or(z.literal(""))
  .transform((value) => value || null);

export const organizationEmailSettingsSchema = z
  .object({
    mode: z.enum(["INHERIT", "CUSTOM", "DISABLED"]),
    fromName: z
      .string()
      .trim()
      .max(120, "Sender name must be 120 characters or fewer")
      .optional()
      .transform((value) => value || null),
    fromEmail: optionalEmail.optional().transform((value) => value ?? null),
    replyToEmail: optionalEmail.optional().transform((value) => value ?? null),
    apiKey: z
      .string()
      .trim()
      .max(512, "API key is too long")
      .optional()
      .transform((value) => value || null),
  })
  .superRefine((value, context) => {
    if (value.mode === "CUSTOM" && !value.fromEmail) {
      context.addIssue({
        code: "custom",
        message: "Sender email is required for custom delivery",
        path: ["fromEmail"],
      });
    }
  });

export const organizationPaymentSettingsSchema = z.object({
  mode: z.enum(["INHERIT", "CUSTOM", "DISABLED"]),
});

export const organizationPaymentActionSchema = z.object({
  action: z.enum(["ONBOARD", "SYNC"]),
});
