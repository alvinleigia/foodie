import { z } from "zod";

import { staffPermissions } from "@/lib/staff-permissions";

const permissionsSchema = z
  .array(z.enum(staffPermissions))
  .max(staffPermissions.length)
  .refine(
    (permissions) => new Set(permissions).size === permissions.length,
    "Choose each permission only once.",
  );

export const staffJobSchema = z.object({
  name: z.string().trim().min(1, "Enter a job name.").max(80),
  description: z
    .string()
    .trim()
    .max(240)
    .optional()
    .transform((value) => value || null),
  permissions: permissionsSchema,
  sortOrder: z.coerce.number().int().min(0).max(1000),
  isActive: z.boolean(),
});

export const staffJobAssignmentSchema = z
  .object({
    jobIds: z
      .array(z.string().uuid("Choose a valid job."))
      .max(10, "A staff member can have up to 10 jobs.")
      .refine(
        (jobIds) => new Set(jobIds).size === jobIds.length,
        "Choose each job only once.",
      ),
    payRates: z
      .array(
        z.object({
          jobId: z.string().uuid("Choose a valid job."),
          hourlyRateMinor: z.number().int().min(0).max(1_000_000).nullable(),
        }),
      )
      .max(10)
      .default([]),
    payrollEmployeeReference: z
      .string()
      .trim()
      .max(80)
      .optional()
      .transform((value) => value || null),
    primaryJobId: z.string().uuid("Choose a primary job.").nullable(),
  })
  .superRefine((value, context) => {
    if (value.jobIds.length && !value.primaryJobId) {
      context.addIssue({
        code: "custom",
        message: "Choose a primary job.",
        path: ["primaryJobId"],
      });
    }

    if (value.primaryJobId && !value.jobIds.includes(value.primaryJobId)) {
      context.addIssue({
        code: "custom",
        message: "The primary job must be assigned to this staff member.",
        path: ["primaryJobId"],
      });
    }

    const rateJobIds = value.payRates.map((rate) => rate.jobId);
    if (new Set(rateJobIds).size !== rateJobIds.length) {
      context.addIssue({
        code: "custom",
        message: "Set each job's pay rate only once.",
        path: ["payRates"],
      });
    }

    if (rateJobIds.some((jobId) => !value.jobIds.includes(jobId))) {
      context.addIssue({
        code: "custom",
        message: "Pay rates can only be set for assigned jobs.",
        path: ["payRates"],
      });
    }
  });

export type StaffJobInput = z.infer<typeof staffJobSchema>;
export type StaffJobAssignmentInput = z.infer<
  typeof staffJobAssignmentSchema
>;
