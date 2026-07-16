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

export const organizationOAuthSettingsSchema = z.object({
  provider: z.enum(["GOOGLE", "APPLE", "FACEBOOK"]),
  mode: z.enum(["INHERIT", "CUSTOM", "DISABLED"]),
  clientId: z
    .string()
    .trim()
    .max(512, "Client ID must be 512 characters or fewer")
    .optional()
    .transform((value) => value || null),
  clientSecret: z
    .string()
    .trim()
    .max(8192, "Client secret must be 8192 characters or fewer")
    .optional()
    .transform((value) => value || null),
});
