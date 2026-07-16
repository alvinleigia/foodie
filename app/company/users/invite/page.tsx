import { redirectToActiveCompanyWorkspace } from "@/lib/company-workspace-access";

export default async function CompanyUserInvitePage() {
  await redirectToActiveCompanyWorkspace("userInvite");
}
