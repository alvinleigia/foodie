import { z } from "zod";

const quantityInput = (options: { allowZero: boolean; label: string }) =>
  z
    .union([z.string(), z.number()])
    .transform((value) => String(value).trim())
    .refine((value) => value !== "", `${options.label} is required`)
    .refine((value) => Number.isFinite(Number(value)), "Use a valid number")
    .refine(
      (value) =>
        options.allowZero ? Number(value) >= 0 : Number(value) > 0,
      options.allowZero
        ? `${options.label} cannot be negative`
        : `${options.label} must be greater than zero`,
    )
    .refine(
      (value) => Number(value) <= 99_999_999_999,
      `${options.label} is too large`,
    )
    .transform((value) => Number(value).toFixed(3));

export const ingredientSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Name is required").max(120, "Name is too long"),
  unit: z.string().trim().min(1, "Unit is required").max(24, "Unit is too long"),
  currentQuantity: quantityInput({ allowZero: true, label: "Current quantity" }),
  lowStockThreshold: quantityInput({ allowZero: true, label: "Low-stock threshold" }),
  notes: z.string().trim().max(240, "Notes are too long").optional().or(z.literal("")),
  isActive: z.boolean(),
});

export const recipeSchema = z
  .object({
    menuItemId: z.string().uuid(),
    ingredients: z
      .array(
        z.object({
          ingredientId: z.string().uuid(),
          quantity: quantityInput({ allowZero: false, label: "Recipe quantity" }),
        }),
      )
      .max(100, "A recipe cannot contain more than 100 ingredients"),
  })
  .superRefine((value, context) => {
    const ingredientIds = value.ingredients.map((item) => item.ingredientId);
    if (new Set(ingredientIds).size !== ingredientIds.length) {
      context.addIssue({
        code: "custom",
        path: ["ingredients"],
        message: "Each ingredient can appear only once in a recipe",
      });
    }
  });

const movementQuantityInput = z
  .union([z.string(), z.number()])
  .transform((value) => String(value).trim())
  .refine((value) => value !== "", "Quantity is required")
  .refine((value) => Number.isFinite(Number(value)), "Use a valid number")
  .refine(
    (value) => Math.abs(Number(value)) <= 99_999_999_999,
    "Quantity is too large",
  )
  .transform((value) => Number(value).toFixed(3));

export const ingredientMovementSchema = z
  .object({
    ingredientId: z.string().uuid(),
    action: z.enum(["RECEIPT", "WASTE", "ADJUSTMENT", "STOCKTAKE"]),
    quantity: movementQuantityInput,
    reason: z.string().trim().min(2, "Reason is required").max(240),
  })
  .superRefine((value, context) => {
    const quantity = Number(value.quantity);
    if (value.action === "STOCKTAKE" && quantity < 0) {
      context.addIssue({
        code: "custom",
        path: ["quantity"],
        message: "Counted quantity cannot be negative",
      });
    } else if (
      value.action !== "STOCKTAKE" &&
      value.action !== "ADJUSTMENT" &&
      quantity <= 0
    ) {
      context.addIssue({
        code: "custom",
        path: ["quantity"],
        message: "Quantity must be greater than zero",
      });
    } else if (value.action === "ADJUSTMENT" && quantity === 0) {
      context.addIssue({
        code: "custom",
        path: ["quantity"],
        message: "Adjustment cannot be zero",
      });
    }
  });
