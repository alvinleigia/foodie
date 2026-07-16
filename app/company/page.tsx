import { redirectToActiveCompanyWorkspace } from "@/lib/company-workspace-access";

export default async function CompanyPage() {
  await redirectToActiveCompanyWorkspace("dashboard");
}
