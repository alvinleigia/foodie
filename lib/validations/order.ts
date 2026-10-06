import { z } from "zod";

import { orderFulfilmentTypes } from "@/lib/order-fulfilment";
import { optionalManagerApprovalSchema } from "@/lib/validations/manager-approval";
import { normalizeCustomerPhone, isValidCustomerPhone } from "@/lib/validations/customer";

const optionalContactEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address")
  .max(254)
  .nullable();

const optionalContactPhoneSchema = z
  .string()
  .transform(normalizeCustomerPhone)
  .refine(isValidCustomerPhone, "Enter a valid mobile number with country code")
  .nullable();

export const createOrderSchema = z
  .object({
    customerId: z.string().uuid("Choose a valid customer").nullable().optional(),
    customerName: z
      .string()
      .trim()
      .min(2, "Name is required")
      .max(80, "Name is too long")
      .optional(),
    checkoutMode: z.enum(["GUEST", "ACCOUNT"]).optional(),
    paymentTiming: z.enum(["ONLINE", "PAY_LATER"]).optional(),
    customerContact: z
      .object({
        name: z.string().trim().min(2, "Name is required").max(100),
        email: optionalContactEmailSchema,
        phone: optionalContactPhoneSchema,
      })
      .optional(),
    fulfilmentType: z.enum(orderFulfilmentTypes),
    openDineInOrderId: z.string().uuid("Choose a valid open dine-in check").optional(),
    deliveryAddress: z
      .object({
        line1: z.string().trim().min(1, "Address line 1 is required").max(120),
        line2: z.string().trim().max(120).optional().or(z.literal("")),
        city: z.string().trim().min(1, "Town or city is required").max(80),
        region: z.string().trim().max(80).optional().or(z.literal("")),
        postalCode: z.string().trim().min(1, "Postcode is required").max(24),
        countryCode: z
          .string()
          .trim()
          .length(2, "Use a two-letter country code")
          .transform((value) => value.toUpperCase()),
        instructions: z.string().trim().max(300).optional().or(z.literal("")),
      })
      .nullable()
      .optional(),
    scheduledFulfilmentAt: z.iso.datetime().nullable().optional(),
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
  })
  .superRefine((order, context) => {
    if (order.checkoutMode && (!order.paymentTiming || !order.customerContact)) {
      context.addIssue({
        code: "custom",
        message: "Checkout contact and payment details are required",
        path: ["customerContact"],
      });
    }

    if (order.checkoutMode === "GUEST" && order.paymentTiming !== "ONLINE") {
      context.addIssue({
        code: "custom",
        message: "Guest checkout requires online payment",
        path: ["paymentTiming"],
      });
    }

    if (order.fulfilmentType === "DELIVERY" && !order.deliveryAddress) {
      context.addIssue({
        code: "custom",
        message: "Delivery address is required",
        path: ["deliveryAddress"],
      });
    }

    if (order.openDineInOrderId && order.fulfilmentType !== "DINE_IN") {
      context.addIssue({
        code: "custom",
        message: "Only dine-in checks can accept additional items",
        path: ["openDineInOrderId"],
      });
    }
  });

export const customerCancelOrderSchema = z.object({
  acknowledgedCancellationFeeBps: z.coerce.number().int().min(0).max(10_000),
  customerToken: z.string().min(20),
  cancelReason: z.string().trim().max(200).optional(),
});

export const claimGuestOrderSchema = z.object({
  customerToken: z.string().min(20),
});

export const staffCancelOrderSchema = z.object({
  applyCustomerCancellationFee: z.boolean().default(false),
  cancellationFeePercent: z.coerce.number().min(0).max(100).optional(),
  cancelReason: z.string().trim().max(200).optional(),
  overrideReason: z.string().trim().max(200).optional(),
  managerApproval: optionalManagerApprovalSchema,
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
