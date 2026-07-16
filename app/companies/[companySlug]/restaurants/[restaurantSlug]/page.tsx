import Link from "next/link";
import { MailIcon, UsersIcon } from "lucide-react";

import { OrganizationEditPanel } from "@/components/admin/OrganizationEditPanel";
import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { ButtonLabel } from "@/components/shared/ButtonLabel";
import { Button } from "@/components/ui/button";
import {
  getCompanyRestaurantHref,
  getCompanyWorkspaceHref,
} from "@/lib/company-workspace";
import { requireCompanyRestaurantWorkspaceAccess } from "@/lib/company-workspace-access";

type CompanyRestaurantPageProps = {
  params: Promise<{ companySlug: string; restaurantSlug: string }>;
};

export default async function CompanyWorkspaceRestaurantPage({
  params,
}: CompanyRestaurantPageProps) {
  const { companySlug, restaurantSlug } = await params;
  const { company, restaurant, session } =
    await requireCompanyRestaurantWorkspaceAccess({
      companySlug,
      restaurantSlug,
    });

  return (
    <SaasAdminShell
      activePath={getCompanyWorkspaceHref(company.slug, "restaurants")}
      eyebrow="Company"
      title="Restaurant settings"
      description="Edit restaurant tenant details and lifecycle status."
      user={{
        name: session.user.name,
        organizationId: session.user.organizationId,
        role: session.user.role,
      }}
    >
      <div className="mb-5 flex flex-wrap justify-end gap-3">
        <Button asChild variant="outline">
          <Link
            href={getCompanyRestaurantHref(
              company.slug,
              restaurant.slug,
              "staff",
            )}
          >
            <ButtonLabel icon={UsersIcon}>Restaurant staff</ButtonLabel>
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link
            href={getCompanyRestaurantHref(
              company.slug,
              restaurant.slug,
              "integrations",
            )}
          >
            <ButtonLabel icon={MailIcon}>Email delivery</ButtonLabel>
          </Link>
        </Button>
      </div>
      <OrganizationEditPanel
        apiPath={`/api/company/restaurants/${restaurant.id}`}
        backHref={getCompanyWorkspaceHref(company.slug, "restaurants")}
        entityLabel="Restaurant"
        organization={restaurant}
      />
    </SaasAdminShell>
  );
}
