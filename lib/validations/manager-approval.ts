import { z } from "zod";

export const managerApprovalCredentialsSchema = z.object({
  identifier: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(200),
});

export const optionalManagerApprovalSchema =
  managerApprovalCredentialsSchema.optional();

export type ManagerApprovalCredentials = z.infer<
  typeof managerApprovalCredentialsSchema
>;
