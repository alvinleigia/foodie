import { z } from "zod";

const optionalNotes = z
  .string()
  .trim()
  .max(500)
  .optional()
  .or(z.literal(""))
  .transform((value) => value || null);

const quantity = (label: string, allowZero = false) =>
  z
    .union([z.string(), z.number()])
    .transform((value) => String(value).trim())
    .refine((value) => value !== "", `${label} is required`)
    .refine((value) => Number.isFinite(Number(value)), "Use a valid number")
    .refine(
      (value) => (allowZero ? Number(value) >= 0 : Number(value) > 0),
      allowZero
        ? `${label} cannot be negative`
        : `${label} must be greater than zero`,
    )
    .refine((value) => Number(value) <= 99_999_999_999, `${label} is too large`)
    .transform((value) => Number(value).toFixed(3));

export const stockTransferSchema = z
  .object({
    destinationOrganizationId: z.string().uuid(),
    notes: optionalNotes,
    lines: z
      .array(
        z.object({
          sourceIngredientId: z.string().uuid(),
          destinationIngredientId: z.string().uuid(),
          quantity: quantity("Transfer quantity"),
        }),
      )
      .min(1, "Add at least one ingredient")
      .max(100, "A transfer cannot contain more than 100 lines"),
  })
  .superRefine((value, context) => {
    const sourceIds = value.lines.map((line) => line.sourceIngredientId);
    if (new Set(sourceIds).size !== sourceIds.length) {
      context.addIssue({
        code: "custom",
        path: ["lines"],
        message: "Each source ingredient can appear only once",
      });
    }
  });

export const stockTransferStatusSchema = z.object({
  action: z.enum(["SEND", "CANCEL"]),
});

export const stockTransferReceiptSchema = z
  .object({
    lines: z
      .array(
        z.object({
          transferItemId: z.string().uuid(),
          receivedQuantity: quantity("Received quantity", true),
        }),
      )
      .min(1)
      .max(100),
  })
  .superRefine((value, context) => {
    const itemIds = value.lines.map((line) => line.transferItemId);
    if (new Set(itemIds).size !== itemIds.length) {
      context.addIssue({
        code: "custom",
        path: ["lines"],
        message: "Each transfer line can appear only once",
      });
    }
  });
