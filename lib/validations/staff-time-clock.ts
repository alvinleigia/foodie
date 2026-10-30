import { z } from "zod";

const noteSchema = z
  .string()
  .trim()
  .max(500)
  .optional()
  .transform((value) => value || null);

export const staffTimeClockActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("CLOCK_IN"),
    jobId: z.string().uuid("Choose an assigned job."),
    scheduledShiftId: z.string().uuid("Choose a scheduled shift.").optional(),
    note: noteSchema,
  }),
  z.object({
    action: z.literal("START_BREAK"),
  }),
  z.object({
    action: z.literal("END_BREAK"),
  }),
  z.object({
    action: z.literal("CLOCK_OUT"),
    note: noteSchema,
  }),
]);

export type StaffTimeClockAction = z.infer<
  typeof staffTimeClockActionSchema
>;
