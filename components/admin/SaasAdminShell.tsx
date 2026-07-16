import { eq } from "drizzle-orm";

import { AppHeader } from "@/components/shared/AppHeader";
import { CommercialAccessBlocked } from "@/components/admin/CommercialAccessBlocked";
import { MembershipSwitcher } from "@/components/admin/MembershipSwitcher";
import { AppShell } from "@/components/shared/AppShell";
import { SectionHeader } from "@/components/shared/SectionHeader";
import { getDb } from "@/db";
import { organizations } from "@/db/schema";
import { getTenantSubscriptionAccess } from "@/lib/billing";
import { canAccessRole, platformAdminRoles } from "@/lib/role-access";
import {
  staffNavigationItems,
  uatResetNavigationItem,
} from "@/lib/staff-navigation";
import { isUatDatabaseResetEnabled } from "@/lib/uat-reset";
import type { MembershipRole } from "@/lib/staff-auth";

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
    role: MembershipRole;
  };
};

async function getOrganizationContextName(organizationId?: string | null) {
  if (!organizationId) {
    return null;
  }

  const [organization] = await getDb()
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);

  return organization?.name ?? null;
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
  const [commercialAccess, contextName] = await Promise.all([
    user.organizationId && !canAccessRole(user.role, platformAdminRoles)
      ? getTenantSubscriptionAccess(user.organizationId)
      : Promise.resolve({ allowed: true, status: null }),
    getOrganizationContextName(user.organizationId),
  ]);
  const navigationItems = isUatDatabaseResetEnabled()
    ? [...staffNavigationItems, uatResetNavigationItem]
    : staffNavigationItems;
  const content = commercialAccess.allowed ? (
    children
  ) : (
    <CommercialAccessBlocked status={commercialAccess.status} />
  );

  return (
    <AppShell variant="dark" contentClassName="max-w-7xl">
      <AppHeader
        activePath={activePath}
        navigationItems={navigationItems}
        user={{ contextName, name: user.name, role: user.role }}
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
