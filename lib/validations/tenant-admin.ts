import { z } from "zod";

import { isSupportedCurrency, isSupportedTimezone } from "@/data/locale-options";
import { DEFAULT_CURRENCY, DEFAULT_TIMEZONE } from "@/lib/locale-defaults";
import { staffPermissions } from "@/lib/staff-permissions";

export const staffRoles = [
  "COMPANY_OWNER",
  "RESTAURANT_MANAGER",
  "ORDER_OPERATOR",
] as const;

export const companyStaffRoles = ["COMPANY_OWNER"] as const;

export const restaurantStaffRoles = ["RESTAURANT_MANAGER", "ORDER_OPERATOR"] as const;

const timezoneSchema = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .refine(isSupportedTimezone, "Choose a supported timezone");

const currencySchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(3)
  .max(8)
  .refine(isSupportedCurrency, "Choose a supported currency");

const cancellationFeePercentSchema = z.coerce
  .number()
  .min(0, "Cancellation fee cannot be below 0%")
  .max(100, "Cancellation fee cannot exceed 100%");

export const organizationSettingsSchema = z.object({
  name: z.string().trim().min(2, "Organization name is required").max(120),
  logoUrl: z
    .string()
    .trim()
    .url("Logo must be a valid URL")
    .optional()
    .or(z.literal(""))
    .transform((value) => value || null),
  timezone: timezoneSchema,
  currency: currencySchema,
  customerCancellationFeePercent: cancellationFeePercentSchema,
});

export const orderingPointSettingsSchema = z.object({
  name: z.string().trim().min(2, "Ordering point name is required").max(120),
  label: z.string().trim().max(160).optional().transform((value) => value || null),
  qrSlug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens")
    .min(3)
    .max(80)
    .optional()
    .or(z.literal(""))
    .transform((value) => value || null),
  isActive: z.boolean().default(true),
});

export const createStaffUserSchema = z.object({
  username: z.string().trim().min(3).max(60),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(staffRoles),
});

export const createStaffInvitationSchema = z.object({
  username: z.string().trim().min(3).max(60),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email(),
  role: z.enum(staffRoles),
});

export const createCompanyStaffInvitationSchema = createStaffInvitationSchema.extend({
  role: z.enum(companyStaffRoles),
});

export const createRestaurantStaffInvitationSchema = createStaffInvitationSchema.extend({
  role: z.enum(restaurantStaffRoles),
});

export const updateStaffMembershipSchema = z.object({
  role: z.enum(staffRoles),
  isActive: z.boolean(),
  permissions: z
    .array(z.enum(staffPermissions))
    .max(staffPermissions.length)
    .refine(
      (permissions) => new Set(permissions).size === permissions.length,
      "Choose each permission only once",
    )
    .optional(),
});

export const updateCompanyStaffMembershipSchema = z.object({
  role: z.enum(companyStaffRoles),
  isActive: z.boolean(),
});

export const reassignExistingUserSchema = z.object({
  identifier: z.string().trim().min(3, "Enter an email or username").max(160),
  role: z.enum(staffRoles),
  organizationId: z.string().uuid("Choose a target organization"),
  deactivateExisting: z.boolean().default(true),
});

export const acceptStaffInvitationSchema = z.object({
  token: z.string().trim().min(20),
  password: z.string().optional(),
});

export const resetPasswordSchema = z.object({
  token: z.string().trim().min(20),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const updateUserAccountSchema = z.object({
  username: z.string().trim().min(3, "Username is required").max(60),
  name: z.string().trim().min(2, "Name is required").max(120),
  email: z.string().trim().email("Enter a valid email"),
});

export const createCompanyOrganizationSchema = z.object({
  name: z.string().trim().min(2, "Company name is required").max(120),
  timezone: timezoneSchema.default(DEFAULT_TIMEZONE),
  currency: currencySchema.default(DEFAULT_CURRENCY),
});

export const updateOrganizationAdminSchema = z.object({
  name: z.string().trim().min(2, "Organization name is required").max(120),
  timezone: timezoneSchema,
  currency: currencySchema,
  isActive: z.boolean(),
});

export const updateChildRestaurantAdminSchema = updateOrganizationAdminSchema.extend({
  customerCancellationFeePercent: cancellationFeePercentSchema,
});

export const createChildRestaurantSchema = z.object({
  name: z.string().trim().min(2, "Restaurant name is required").max(120),
  timezone: timezoneSchema.default(DEFAULT_TIMEZONE),
  currency: currencySchema.default(DEFAULT_CURRENCY),
});

export const companyDomainSchema = z.object({
  domain: z
    .string()
    .trim()
    .toLowerCase()
    .transform((value) => value.replace(/^https?:\/\//, "").split("/")[0].split(":")[0])
    .refine((value) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(value), {
      message: "Enter a valid domain such as foodie.allgoonline.co.uk",
    }),
  isPrimary: z.boolean().default(false),
  isActive: z.boolean().default(true),
  restaurantOrganizationId: z.string().uuid().nullable().optional().default(null),
});

export const updateCompanyDomainSchema = z.object({
  isPrimary: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

const createTenantStaffBaseSchema = z.object({
  username: z.string().trim().min(3).max(60),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const createCompanyStaffUserSchema = createTenantStaffBaseSchema.extend({
  role: z.enum(companyStaffRoles),
});

export const createRestaurantStaffUserSchema = createTenantStaffBaseSchema.extend({
  role: z.enum(restaurantStaffRoles),
});
