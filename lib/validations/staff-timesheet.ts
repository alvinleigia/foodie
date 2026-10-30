import { z } from "zod";

const businessDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.");

const staffTimesheetFilterFields = {
  from: businessDateSchema.optional(),
  query: z.string().trim().max(120).optional(),
  status: z.enum(["ACTIVE", "APPROVED", "PENDING"]).optional(),
  to: businessDateSchema.optional(),
};

function hasValidDateOrder(value: { from?: string; to?: string }) {
  return !value.from || !value.to || value.from <= value.to;
}

export const staffTimesheetFiltersSchema = z
  .object(staffTimesheetFilterFields)
  .refine(hasValidDateOrder, {
    message: "From date must be on or before the to date.",
    path: ["to"],
  });

export const staffTimesheetExportFiltersSchema = z
  .object({
    from: staffTimesheetFilterFields.from,
    query: staffTimesheetFilterFields.query,
    to: staffTimesheetFilterFields.to,
  })
  .refine(hasValidDateOrder, {
    message: "From date must be on or before the to date.",
    path: ["to"],
  });

export const staffPayrollExportSchema = z
  .object({
    from: businessDateSchema,
    query: staffTimesheetFilterFields.query,
    to: businessDateSchema,
  })
  .refine(hasValidDateOrder, {
    message: "From date must be on or before the to date.",
    path: ["to"],
  });

export const staffTimesheetBulkApprovalSchema = z.object({
  approved: z.boolean(),
  shiftIds: z.array(z.string().uuid()).min(1).max(100),
});
