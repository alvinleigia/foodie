import { z } from "zod";

import { normalizeCustomerPhone } from "@/lib/validations/customer";

export const customerPhoneOtpRequestSchema = z.object({
  phone: z
    .string()
    .transform(normalizeCustomerPhone)
    .refine(
      (value) => /^\+[1-9]\d{7,14}$/.test(value),
      "Enter a valid mobile number with country code",
    ),
});

export const customerPhoneOtpVerifySchema = customerPhoneOtpRequestSchema.extend({
  code: z.string().trim().regex(/^\d{4,10}$/, "Enter the verification code"),
});
