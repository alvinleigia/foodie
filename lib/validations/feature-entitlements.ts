import { z } from "zod";

import { featureKeys } from "@/lib/feature-entitlements";

const featureOverrideUpdateSchema = z
  .object({
    featureKey: z.enum(featureKeys),
    mode: z.enum(["INHERIT", "ENABLED", "DISABLED"]),
    reason: z
      .string()
      .trim()
      .max(500, "Reason must be 500 characters or fewer")
      .optional()
      .transform((value) => value || null),
    expiresAt: z
      .union([z.iso.datetime(), z.null()])
      .optional()
      .transform((value) => (value ? new Date(value) : null)),
  })
  .superRefine((value, context) => {
    if (value.mode !== "INHERIT" && !value.reason) {
      context.addIssue({
        code: "custom",
        message: "Add a reason for this override",
        path: ["reason"],
      });
    }

    if (value.expiresAt && value.expiresAt <= new Date()) {
      context.addIssue({
        code: "custom",
        message: "Expiry must be in the future",
        path: ["expiresAt"],
      });
    }
  });

export const featureOverrideBatchSchema = z
  .object({
    organizationId: z.uuid(),
    updates: z.array(featureOverrideUpdateSchema).min(1).max(featureKeys.length),
  })
  .superRefine((value, context) => {
    const keys = value.updates.map((update) => update.featureKey);

    if (new Set(keys).size !== keys.length) {
      context.addIssue({
        code: "custom",
        message: "Each feature can only be updated once",
        path: ["updates"],
      });
    }
  });
