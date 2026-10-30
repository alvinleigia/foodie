import { z } from "zod";

const localDateTimeSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/,
    "Choose a valid date and time.",
  );

export const staffScheduledShiftSchema = z
  .object({
    membershipId: z.string().uuid("Choose a staff member.").nullable(),
    jobId: z.string().uuid("Choose an assigned job."),
    startsAt: localDateTimeSchema,
    endsAt: localDateTimeSchema,
    breakMinutes: z.coerce.number().int().min(0).max(480),
    note: z
      .string()
      .trim()
      .max(500)
      .optional()
      .transform((value) => value || null),
    availabilityOverrideReason: z
      .string()
      .trim()
      .max(500)
      .optional()
      .transform((value) => value || null),
  })
  .refine((value) => value.endsAt > value.startsAt, {
    message: "End time must be after start time.",
    path: ["endsAt"],
  });

export const staffScheduledShiftStatusSchema = z.object({
  status: z.literal("CANCELLED"),
});

const businessDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid date.");

export const staffTimeOffRequestSchema = z
  .object({
    startsOn: businessDateSchema,
    endsOn: businessDateSchema,
    reason: z
      .string()
      .trim()
      .max(500)
      .optional()
      .transform((value) => value || null),
  })
  .refine((value) => value.endsOn >= value.startsOn, {
    message: "End date must be on or after start date.",
    path: ["endsOn"],
  });

export const staffTimeOffReviewSchema = z.object({
  status: z.enum(["APPROVED", "DECLINED"]),
  reviewNote: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((value) => value || null),
});

export const staffTimeOffCancelSchema = z.object({
  status: z.literal("CANCELLED"),
});

const staffAvailabilityDaySchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    isAvailable: z.boolean(),
    startsMinute: z.number().int().min(0).max(1439).nullable(),
    endsMinute: z.number().int().min(1).max(1440).nullable(),
  })
  .superRefine((value, context) => {
    if (!value.isAvailable) {
      if (value.startsMinute !== null || value.endsMinute !== null) {
        context.addIssue({
          code: "custom",
          message: "Unavailable days cannot include working hours.",
        });
      }
      return;
    }

    if (
      value.startsMinute === null ||
      value.endsMinute === null ||
      value.endsMinute <= value.startsMinute
    ) {
      context.addIssue({
        code: "custom",
        message: "End time must be after start time.",
      });
    }
  });

export const staffWeeklyAvailabilitySchema = z
  .object({
    days: z.array(staffAvailabilityDaySchema).length(7),
  })
  .superRefine((value, context) => {
    if (new Set(value.days.map((day) => day.dayOfWeek)).size !== 7) {
      context.addIssue({
        code: "custom",
        message: "Include each day of the week once.",
      });
    }
  });

export const staffShiftCoverRequestSchema = z.object({
  scheduledShiftId: z.string().uuid(),
  reason: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((value) => value || null),
});

export const staffShiftCoverClaimSchema = z.object({
  requestId: z.string().uuid(),
  note: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((value) => value || null),
});

export const staffShiftCoverReviewSchema = z.object({
  claimId: z.string().uuid(),
  status: z.enum(["APPROVED", "DECLINED"]),
});

export const staffShiftCoverCancelSchema = z.object({
  status: z.literal("CANCELLED"),
});

export const staffShiftCoverWithdrawSchema = z.object({
  status: z.literal("WITHDRAWN"),
});

export type StaffScheduledShiftInput = z.infer<
  typeof staffScheduledShiftSchema
>;
