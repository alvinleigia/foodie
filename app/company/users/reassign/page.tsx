import { redirectToActiveCompanyWorkspace } from "@/lib/company-workspace-access";

export default async function CompanyUserReassignPage() {
  await redirectToActiveCompanyWorkspace("userReassign");
}
