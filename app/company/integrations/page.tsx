import { redirectToActiveCompanyWorkspace } from "@/lib/company-workspace-access";

export default async function CompanyIntegrationsPage() {
  await redirectToActiveCompanyWorkspace("integrations");
}
