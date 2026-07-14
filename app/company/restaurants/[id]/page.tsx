import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { MailIcon } from "lucide-react";

import { auth } from "@/auth";
import { OrganizationEditPanel } from "@/components/admin/OrganizationEditPanel";
import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { ButtonLabel } from "@/components/shared/ButtonLabel";
import { Button } from "@/components/ui/button";
import { canAccessRole, companyAdminRoles } from "@/lib/role-access";
import { getCompanyRestaurant } from "@/lib/saas-admin";

export default async function CompanyRestaurantEditPage(
  props: PageProps<"/company/restaurants/[id]">,
) {
  const session = await auth();

  if (
    !session?.user?.role ||
    !session.user.organizationId ||
    !canAccessRole(session.user.role, companyAdminRoles)
  ) {
    redirect("/staff/login");
  }

  const { id } = await props.params;
  const restaurant = await getCompanyRestaurant(session.user.organizationId, id);

  if (!restaurant) {
    notFound();
  }

  return (
    <SaasAdminShell
      activePath="/company"
      eyebrow="Company"
      title="Restaurant settings"
      description="Edit restaurant tenant details and lifecycle status."
      user={{
        name: session.user.name,
        organizationId: session.user.organizationId,
        role: session.user.role,
      }}
    >
      <div className="mb-5 flex justify-end">
        <Button asChild variant="outline">
          <Link href={`/company/restaurants/${restaurant.id}/integrations`}>
            <ButtonLabel icon={MailIcon}>Email delivery</ButtonLabel>
          </Link>
        </Button>
      </div>
      <OrganizationEditPanel
        apiPath={`/api/company/restaurants/${restaurant.id}`}
        backHref="/company"
        entityLabel="Restaurant"
        organization={restaurant}
      />
    </SaasAdminShell>
  );
}
