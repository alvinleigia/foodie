import { eq } from "drizzle-orm";

import { AppHeader } from "@/components/shared/AppHeader";
import { CommercialAccessBlocked } from "@/components/admin/CommercialAccessBlocked";
import { MembershipSwitcher } from "@/components/admin/MembershipSwitcher";
import { AppShell } from "@/components/shared/AppShell";
import { SectionHeader } from "@/components/shared/SectionHeader";
import { getDb } from "@/db";
import { organizations } from "@/db/schema";
import { getTenantSubscriptionAccess } from "@/lib/billing";
import { getOrganizationFeatureEntitlement } from "@/lib/feature-entitlements";
import { canAccessRole, platformAdminRoles } from "@/lib/role-access";
import {
  getStaffNavigationItemsForCompany,
  getStaffNavigationItemsForRestaurant,
  staffNavigationItems,
  uatResetNavigationItem,
} from "@/lib/staff-navigation";
import { isUatDatabaseResetEnabled } from "@/lib/uat-reset";
import type { MembershipRole } from "@/lib/staff-auth";
import type { StaffPermission } from "@/lib/staff-permissions";
import { getStaffHomePathForOrganization } from "@/lib/staff-home";

type SaasAdminShellProps = {
  activePath: string;
  children: React.ReactNode;
  contentMode?: "panel" | "plain";
  eyebrow: string;
  title: string;
  description: string;
  user: {
    name?: string | null;
    organizationId?: string | null;
    permissions?: StaffPermission[];
    role: MembershipRole;
  };
};

async function getOrganizationContext(organizationId?: string | null) {
  if (!organizationId) {
    return null;
  }

  const [organization] = await getDb()
    .select({
      name: organizations.name,
      slug: organizations.slug,
      type: organizations.type,
    })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);

  return organization ?? null;
}

export async function SaasAdminShell({
  activePath,
  children,
  contentMode = "panel",
  description,
  eyebrow,
  title,
  user,
}: SaasAdminShellProps) {
  const [commercialAccess, organizationContext] = await Promise.all([
    user.organizationId && !canAccessRole(user.role, platformAdminRoles)
      ? getTenantSubscriptionAccess(user.organizationId)
      : Promise.resolve({ allowed: true, status: null }),
    getOrganizationContext(user.organizationId),
  ]);
  const [inventoryEnabled, reportsEnabled] =
    organizationContext?.type === "RESTAURANT" && user.organizationId
      ? await Promise.all([
          getOrganizationFeatureEntitlement(
            user.organizationId,
            "operations.inventory",
          ).then((entitlement) => entitlement.enabled),
          getOrganizationFeatureEntitlement(
            user.organizationId,
            "reports.operational",
          ).then((entitlement) => entitlement.enabled),
        ])
      : [true, true];
  const scopedNavigationItems =
    organizationContext?.type === "RESTAURANT"
      ? getStaffNavigationItemsForRestaurant(organizationContext.slug, {
          inventoryEnabled,
          reportsEnabled,
        })
      : organizationContext?.type === "COMPANY"
        ? getStaffNavigationItemsForCompany(organizationContext.slug)
      : staffNavigationItems;
  const navigationItems = isUatDatabaseResetEnabled()
    ? [...scopedNavigationItems, uatResetNavigationItem]
    : scopedNavigationItems;
  const brandHref =
    getStaffHomePathForOrganization(
      user.role,
      organizationContext,
      user.permissions,
      { inventoryEnabled, reportsEnabled },
    ) ?? "/";
  const content = commercialAccess.allowed ? (
    children
  ) : (
    <CommercialAccessBlocked status={commercialAccess.status} />
  );

  return (
    <AppShell variant="dark" contentClassName="max-w-7xl">
      <AppHeader
        activePath={activePath}
        brandHref={brandHref}
        navigationItems={navigationItems}
        user={{
          contextName: organizationContext?.name,
          name: user.name,
          permissions: user.permissions,
          role: user.role,
        }}
      />
      <div className="mb-6 flex justify-end">
        <MembershipSwitcher
          currentOrganizationId={user.organizationId}
          currentRole={user.role}
        />
      </div>

      {contentMode === "plain" ? (
        content
      ) : (
        <section className="rounded-xl border border-white/10 bg-white/90 p-6 text-stone-950 shadow-[0_24px_80px_rgba(0,0,0,0.22)]">
          <SectionHeader
            eyebrow={eyebrow}
            title={title}
            description={description}
            className="mb-6"
          />
          {content}
        </section>
      )}
    </AppShell>
  );
}
