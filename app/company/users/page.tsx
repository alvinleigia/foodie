import { redirectToActiveCompanyWorkspace } from "@/lib/company-workspace-access";

export default async function CompanyUsersPage() {
  await redirectToActiveCompanyWorkspace("users");
}
