import { z } from "zod";

import { orderFulfilmentTypes } from "@/lib/order-fulfilment";

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

export const menuItemSchema = z
  .object({
    categoryId: z.string().uuid("Choose a valid category"),
    prepStationId: z
      .union([
        z.string().uuid("Choose a valid preparation station"),
        z.literal(""),
        z.null(),
      ])
      .optional()
      .transform((value) => value || null),
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
    modifierGroupIds: z.array(z.string().uuid("Choose a valid add-on group")).default([]),
    taxAssignmentMode: z.enum(["DEFAULT", "CUSTOM"]).default("DEFAULT"),
    taxDefinitionIds: z.array(z.string().uuid("Choose a valid tax")).default([]),
    fulfilmentTaxOverrides: z
      .array(
        z.object({
          fulfilmentType: z.enum(orderFulfilmentTypes),
          taxDefinitionIds: z
            .array(z.string().uuid("Choose a valid tax"))
            .min(1, "Choose at least one tax for this fulfilment exception"),
        }),
      )
      .max(
        orderFulfilmentTypes.length,
        "Only one tax exception is allowed per fulfilment type",
      )
      .default([]),
  })
  .superRefine((item, context) => {
    if (item.taxAssignmentMode === "CUSTOM" && item.taxDefinitionIds.length === 0) {
      context.addIssue({
        code: "custom",
        message: "Choose at least one tax for this product",
        path: ["taxDefinitionIds"],
      });
    }

    const fulfilmentTypes = new Set<string>();

    for (const [index, override] of item.fulfilmentTaxOverrides.entries()) {
      if (fulfilmentTypes.has(override.fulfilmentType)) {
        context.addIssue({
          code: "custom",
          message: "Only one tax exception is allowed per fulfilment type",
          path: ["fulfilmentTaxOverrides", index, "fulfilmentType"],
        });
      }

      fulfilmentTypes.add(override.fulfilmentType);
    }
  });

export const menuModifierGroupSchema = z
  .object({
    name: z.string().trim().min(2, "Group name is required").max(80, "Group name is too long"),
    description: z.string().max(240, "Description is too long").optional().transform(emptyToNull),
    selectionType: z.enum(["SINGLE", "MULTIPLE"]).default("MULTIPLE"),
    isRequired: z.boolean().default(false),
    minSelections: z.coerce.number().int().min(0).default(0),
    maxSelections: z
      .string()
      .optional()
      .transform((value) => {
        const trimmed = value?.trim();
        return trimmed ? Number(trimmed) : null;
      })
      .refine((value) => value === null || (Number.isInteger(value) && value > 0), "Enter a valid maximum"),
    sortOrder: z.coerce.number().int().min(0).default(0),
    isActive: z.boolean().default(true),
  })
  .refine(
    (value) => value.maxSelections === null || value.maxSelections >= value.minSelections,
    {
      message: "Maximum selections cannot be lower than minimum selections",
      path: ["maxSelections"],
    },
  );

export const menuModifierOptionSchema = z.object({
  groupId: z.string().uuid("Choose a valid add-on group"),
  name: z.string().trim().min(2, "Option name is required").max(80, "Option name is too long"),
  priceDelta: z
    .string()
    .optional()
    .transform(parseOptionalPrice)
    .refine((value) => value === null || value !== "__invalid__", "Enter a valid price")
    .transform((value) => (value === "__invalid__" || value === null ? "0.00" : value)),
  sortOrder: z.coerce.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
  isSoldOut: z.boolean().default(false),
});
