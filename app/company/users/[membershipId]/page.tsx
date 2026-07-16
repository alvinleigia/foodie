import { redirect } from "next/navigation";

import {
  getCompanyUserHref,
} from "@/lib/company-workspace";
import { requireCompanyWorkspaceAccess } from "@/lib/company-workspace-access";

export default async function CompanyUserAccessPage(
  props: PageProps<"/company/users/[membershipId]">,
) {
  const { company } = await requireCompanyWorkspaceAccess({
    destination: "users",
  });
  const { membershipId } = await props.params;
  const searchParams = await props.searchParams;
  const returnTo = Array.isArray(searchParams.returnTo)
    ? searchParams.returnTo[0]
    : searchParams.returnTo;
  const href = getCompanyUserHref(company.slug, membershipId);

  redirect(
    returnTo
      ? `${href}?returnTo=${encodeURIComponent(returnTo)}`
      : href,
  );
}
