import { z } from "zod";

export const customerEmailOtpRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address").max(254),
});

export const customerEmailOtpVerifySchema = customerEmailOtpRequestSchema.extend({
  code: z.string().trim().regex(/^\d{6}$/, "Enter the six-digit code"),
});
