import Link from "next/link";
import { UserCheckIcon } from "lucide-react";

import { ButtonLabel } from "@/components/shared/ButtonLabel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { formatAppDate } from "@/lib/date-format";
import { formatRole } from "@/lib/role-access";
import type { MembershipRole } from "@/lib/staff-auth";

type UserMembership = {
  membershipId: string;
  role: MembershipRole;
  isActive: boolean;
  organizationId: string;
  organizationName: string;
  organizationType: "PLATFORM" | "COMPANY" | "RESTAURANT";
  organizationActive: boolean;
  locationId: string | null;
  locationName: string | null;
  locationLabel: string | null;
  locationActive: boolean | null;
  updatedAt: string;
};

type PlatformUserMembership = {
  userId: string;
  username: string;
  name: string;
  email: string;
  userStatus: string;
  memberships: UserMembership[];
};

type PlatformUserMembershipsPanelProps = {
  users: PlatformUserMembership[];
};

function StatusPill({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "success" | "warning";
  children: React.ReactNode;
}) {
  const toneClass =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-stone-200 bg-white text-stone-500";

  return (
    <span
      className={`rounded-md border px-2 py-0.5 text-xs font-semibold uppercase tracking-[0.14em] ${toneClass}`}
    >
      {children}
    </span>
  );
}

function getScopeLabel(membership: UserMembership) {
  if (membership.role === "PLATFORM_ADMIN") {
    return "SaaS owner access";
  }

  if (membership.locationId) {
    return membership.locationLabel || membership.locationName || "Location";
  }

  return membership.organizationType === "COMPANY"
    ? "Company-level access"
    : "Restaurant-level access";
}

export function PlatformUserMembershipsPanel({
  users,
}: PlatformUserMembershipsPanelProps) {
  return (
    <Card className="rounded-xl border-stone-200 bg-white">
      <CardHeader className="flex flex-col gap-4 px-5 pt-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-xl font-semibold text-stone-950">User memberships</h3>
          <p className="text-sm text-stone-500">
            See every active and disabled access assignment for each user.
          </p>
        </div>
        <Button
          asChild
          className="rounded-lg bg-stone-950 text-white hover:bg-stone-800"
        >
          <Link href="/platform/users/reassign?returnTo=/platform/users/memberships">
            <ButtonLabel icon={UserCheckIcon}>Reassign Existing User</ButtonLabel>
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="grid gap-4 px-5 pb-5">
        {users.length === 0 ? (
          <p className="rounded-lg border border-dashed border-stone-200 p-4 text-sm text-stone-500">
            No user memberships found yet.
          </p>
        ) : null}

        {users.map((user) => (
          <div
            key={user.userId}
            className="rounded-lg border border-stone-200 bg-stone-50 p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="font-semibold text-stone-950">{user.name}</h4>
                  <StatusPill
                    tone={user.userStatus === "ACTIVE" ? "success" : "warning"}
                  >
                    Account {user.userStatus.toLowerCase()}
                  </StatusPill>
                </div>
                <p className="mt-1 text-sm text-stone-500">
                  {user.username} - {user.email}
                </p>
              </div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-400">
                {user.memberships.length} membership
                {user.memberships.length === 1 ? "" : "s"}
              </p>
            </div>

            <div className="mt-4 grid gap-3">
              {user.memberships.map((membership) => (
                <div
                  key={membership.membershipId}
                  className="rounded-lg border border-stone-200 bg-white p-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-stone-950">
                        {membership.role === "PLATFORM_ADMIN"
                          ? "Foodie Platform"
                          : membership.organizationName}
                      </p>
                      <p className="text-sm text-stone-500">
                        {getScopeLabel(membership)}
                      </p>
                      {membership.role === "PLATFORM_ADMIN" ? (
                        <p className="mt-1 text-xs font-medium uppercase tracking-[0.14em] text-stone-400">
                          Bootstrapped from environment
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <StatusPill
                        tone={membership.isActive ? "success" : "warning"}
                      >
                        {membership.isActive ? "Access active" : "Access disabled"}
                      </StatusPill>
                      <StatusPill>{formatRole(membership.role)}</StatusPill>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-400">
                    <span>
                      {membership.organizationType === "PLATFORM"
                        ? "platform system"
                        : membership.organizationType.toLowerCase()}{" "}
                      {membership.organizationActive ? "active" : "disabled"}
                    </span>
                    {membership.locationId ? (
                      <span>
                        Location{" "}
                        {membership.locationActive ? "active" : "disabled"}
                      </span>
                    ) : null}
                    <span>Updated {formatAppDate(membership.updatedAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
