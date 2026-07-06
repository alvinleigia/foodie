import { AppHeader } from "@/components/shared/AppHeader";
import { CommercialAccessBlocked } from "@/components/admin/CommercialAccessBlocked";
import { MembershipSwitcher } from "@/components/admin/MembershipSwitcher";
import { AppShell } from "@/components/shared/AppShell";
import { SectionHeader } from "@/components/shared/SectionHeader";
import { getTenantSubscriptionAccess } from "@/lib/billing";
import { canAccessRole, platformAdminRoles } from "@/lib/role-access";
import { isUatDatabaseResetEnabled } from "@/lib/uat-reset";
import type { MembershipRole } from "@/lib/staff-auth";

type AdminRoute = {
  href: string;
  label: string;
  description: string;
};

type SaasAdminShellProps = {
  activePath: string;
  children: React.ReactNode;
  eyebrow: string;
  title: string;
  description: string;
  user: {
    locationId?: string | null;
    name?: string | null;
    organizationId?: string | null;
    role: MembershipRole;
  };
};

const adminRoutes: AdminRoute[] = [
  {
    href: "/platform",
    label: "Platform",
    description: "SaaS dashboard.",
  },
  {
    href: "/platform/companies",
    label: "Companies",
    description: "Parent company tenants.",
  },
  {
    href: "/platform/users/memberships",
    label: "User Memberships",
    description: "Review cross-tenant access.",
  },
  {
    href: "/company",
    label: "Company",
    description: "Company dashboard.",
  },
  {
    href: "/company/restaurants",
    label: "Company Restaurants",
    description: "Manage company restaurants.",
  },
  {
    href: "/company/users",
    label: "Company Users",
    description: "Manage user access.",
  },
  {
    href: "/restaurant",
    label: "Restaurant",
    description: "Restaurant dashboard.",
  },
  {
    href: "/restaurant/location",
    label: "Locations",
    description: "Manage active location.",
  },
  {
    href: "/restaurant/staff",
    label: "Restaurant Staff",
    description: "Manage location staff.",
  },
  {
    href: "/operations/orders",
    label: "Orders",
    description: "Live order operations.",
  },
  {
    href: "/operations/menu",
    label: "Menu Manager",
    description: "Categories and products.",
  },
  {
    href: "/operations/inventory",
    label: "Inventory",
    description: "Stock control.",
  },
  {
    href: "/audit-logs",
    label: "Audit logs",
    description: "Security and change history.",
  },
];

const uatResetRoute: AdminRoute = {
  href: "/platform/uat-reset",
  label: "UAT Reset",
  description: "Clear testing data.",
};

export async function SaasAdminShell({
  activePath,
  children,
  description,
  eyebrow,
  title,
  user,
}: SaasAdminShellProps) {
  const commercialAccess =
    user.organizationId && !canAccessRole(user.role, platformAdminRoles)
      ? await getTenantSubscriptionAccess(user.organizationId)
      : { allowed: true, status: null };
  const navigationItems = isUatDatabaseResetEnabled()
    ? [...adminRoutes, uatResetRoute]
    : adminRoutes;

  return (
    <AppShell variant="dark" contentClassName="max-w-7xl">
      <AppHeader
        activePath={activePath}
        navigationItems={navigationItems}
        user={{ name: user.name, role: user.role }}
      />
      <div className="mb-6 flex justify-end">
        <MembershipSwitcher
          currentLocationId={user.locationId}
          currentOrganizationId={user.organizationId}
          currentRole={user.role}
        />
      </div>

      <section className="rounded-xl border border-white/10 bg-white/90 p-6 text-stone-950 shadow-[0_24px_80px_rgba(0,0,0,0.22)]">
        <SectionHeader
          eyebrow={eyebrow}
          title={title}
          description={description}
          className="mb-6"
        />
        {commercialAccess.allowed ? (
          children
        ) : (
          <CommercialAccessBlocked status={commercialAccess.status} />
        )}
      </section>
    </AppShell>
  );
}
