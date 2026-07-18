import { z } from "zod";

export const phoneVerificationCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{4,10}$/, "Enter the verification code"),
});
