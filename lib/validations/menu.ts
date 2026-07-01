import { z } from "zod";

function emptyToNull(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function parseOptionalPrice(value: string | null | undefined) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  const normalized = Number(trimmed);

  if (Number.isNaN(normalized) || normalized < 0) {
    return "__invalid__";
  }

  return normalized.toFixed(2);
}

export const menuCategorySchema = z.object({
  name: z.string().trim().min(2, "Category name is required").max(80, "Category name is too long"),
  description: z.string().max(240, "Description is too long").optional().transform(emptyToNull),
  sortOrder: z.coerce.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
  isSoldOut: z.boolean().default(false),
});

export const menuItemSchema = z.object({
  categoryId: z.string().uuid("Choose a valid category"),
  name: z.string().trim().min(2, "Product name is required").max(80, "Product name is too long"),
  description: z.string().max(1000, "Description is too long").optional().transform(emptyToNull),
  price: z
    .string()
    .optional()
    .transform(parseOptionalPrice)
    .refine((value) => value === null || value !== "__invalid__", "Enter a valid price")
    .transform((value) => (value === "__invalid__" ? null : value)),
  imageUrl: z
    .string()
    .optional()
    .transform(emptyToNull)
    .refine(
      (value) => value === null || /^https?:\/\//i.test(value),
      "Image must be a valid URL",
    ),
  sortOrder: z.coerce.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
  tagIds: z.array(z.string().uuid("Choose a valid tag")).default([]),
});
