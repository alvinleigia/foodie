import { z } from "zod";

export const createOrderSchema = z
  .object({
    customerId: z.string().uuid("Choose a valid customer").nullable().optional(),
    customerName: z
      .string()
      .trim()
      .min(2, "Name is required")
      .max(80, "Name is too long")
      .optional(),
    items: z
      .array(
        z.object({
          categoryId: z.string().uuid("Choose a valid category"),
          drinkId: z.string().uuid("Choose a valid drink"),
          quantity: z.coerce.number().int().min(1, "Quantity must be at least 1").max(20, "Quantity is too high"),
          notes: z.string().trim().max(200, "Notes are too long").optional().or(z.literal("")),
          modifiers: z
            .array(
              z.object({
                groupId: z.string().uuid("Choose a valid add-on group"),
                modifierId: z.string().uuid("Choose a valid add-on"),
                quantity: z.coerce.number().int().min(1).max(20).default(1),
              }),
            )
            .default([]),
        }),
      )
      .min(1, "Add at least one drink"),
  });

export const customerCancelOrderSchema = z.object({
  acknowledgedCancellationFeeBps: z.coerce.number().int().min(0).max(10_000),
  customerToken: z.string().min(20),
  cancelReason: z.string().trim().max(200).optional(),
});

export const staffCancelOrderSchema = z.object({
  applyCustomerCancellationFee: z.boolean().default(false),
  cancellationFeePercent: z.coerce.number().min(0).max(100).optional(),
  cancelReason: z.string().trim().max(200).optional(),
  overrideReason: z.string().trim().max(200).optional(),
  retryRefund: z.boolean().default(false),
});

export const orderStatusRequestSchema = z.object({
  orders: z.array(
    z.object({
      orderId: z.string().uuid(),
    }),
  ),
  view: z.enum(["ALL", "ACTIVE", "COMPLETED"]).default("ALL"),
});

export const staffAccessSchema = z.object({
  accessKey: z.string().min(4, "Access key is required"),
});
