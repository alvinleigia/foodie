import { z } from "zod";

const optionalText = (maximum: number) =>
  z
    .string()
    .trim()
    .max(maximum)
    .optional()
    .or(z.literal(""))
    .transform((value) => value || null);

const positiveQuantity = (label: string) =>
  z
    .union([z.string(), z.number()])
    .transform((value) => String(value).trim())
    .refine((value) => value !== "", `${label} is required`)
    .refine((value) => Number.isFinite(Number(value)), "Use a valid number")
    .refine((value) => Number(value) > 0, `${label} must be greater than zero`)
    .refine((value) => Number(value) <= 99_999_999_999, `${label} is too large`)
    .transform((value) => Number(value).toFixed(3));

const optionalUnitCost = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((value) => (value === null || value === undefined ? "" : String(value).trim()))
  .refine(
    (value) => value === "" || Number.isFinite(Number(value)),
    "Use a valid unit cost",
  )
  .refine((value) => value === "" || Number(value) >= 0, "Unit cost cannot be negative")
  .refine((value) => value === "" || Number(value) <= 999_999_999, "Unit cost is too large")
  .transform((value) => (value === "" ? null : Number(value).toFixed(4)));

export const inventorySupplierSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Supplier name is required").max(120),
  contactName: optionalText(120),
  email: z
    .union([z.literal(""), z.string().trim().email("Use a valid email address").max(254)])
    .optional()
    .transform((value) => value || null),
  phone: optionalText(40),
  accountReference: optionalText(80),
  notes: optionalText(500),
  isActive: z.boolean(),
});

export const purchaseOrderSchema = z
  .object({
    supplierId: z.string().uuid(),
    expectedOn: z
      .union([z.literal(""), z.string().date()])
      .optional()
      .transform((value) => value || null),
    notes: optionalText(500),
    lines: z
      .array(
        z.object({
          ingredientId: z.string().uuid(),
          orderedQuantity: positiveQuantity("Ordered quantity"),
          unitCost: optionalUnitCost,
          notes: optionalText(240),
        }),
      )
      .min(1, "Add at least one ingredient")
      .max(100, "A purchase order cannot contain more than 100 lines"),
  })
  .superRefine((value, context) => {
    const ingredientIds = value.lines.map((line) => line.ingredientId);
    if (new Set(ingredientIds).size !== ingredientIds.length) {
      context.addIssue({
        code: "custom",
        path: ["lines"],
        message: "Each ingredient can appear only once",
      });
    }
  });

export const purchaseOrderStatusSchema = z.object({
  action: z.enum(["ORDER", "CANCEL"]),
});

export const purchaseOrderReceiptSchema = z
  .object({
    idempotencyKey: z.string().uuid(),
    notes: optionalText(500),
    lines: z
      .array(
        z.object({
          purchaseOrderItemId: z.string().uuid(),
          quantity: positiveQuantity("Received quantity"),
        }),
      )
      .min(1, "Enter at least one received quantity")
      .max(100),
  })
  .superRefine((value, context) => {
    const itemIds = value.lines.map((line) => line.purchaseOrderItemId);
    if (new Set(itemIds).size !== itemIds.length) {
      context.addIssue({
        code: "custom",
        path: ["lines"],
        message: "Each purchase-order line can appear only once",
      });
    }
  });
