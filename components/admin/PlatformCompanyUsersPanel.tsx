import Link from "next/link";
import {
  MoreHorizontalIcon,
  PencilIcon,
  UserCheckIcon,
  UserPenIcon,
  UserPlusIcon,
} from "lucide-react";

import { ButtonLabel } from "@/components/shared/ButtonLabel";
import { DesktopQuickAction } from "@/components/shared/DesktopQuickAction";
import { StatusPill } from "@/components/shared/StatusPill";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatAppDate } from "@/lib/date-format";
import type { MembershipRole } from "@/lib/staff-auth";

type CompanyUser = {
  membershipId: string;
  username: string;
  name: string;
  email: string;
  userStatus: string;
  role: MembershipRole;
  isActive: boolean;
  accessLabel?: string;
  accessScope?: string;
  updatedAt: string;
};

type PlatformCompanyUsersPanelProps = {
  assignHref?: string | null;
  companyId: string;
  description?: string;
  editHrefBase?: string;
  emptyMessage?: string;
  inviteHref?: string | null;
  inviteLabel?: string;
  title?: string;
  users: CompanyUser[];
};

function formatRole(role: MembershipRole) {
  return role.replaceAll("_", " ");
}

function formatDate(value: string) {
  return formatAppDate(value);
}

function getResetHref(membershipId: string, returnTo: string) {
  return `/users/${membershipId}/reset-password?returnTo=${encodeURIComponent(returnTo)}`;
}

function getAccountHref(membershipId: string, returnTo: string) {
  return `/users/${membershipId}/account?returnTo=${encodeURIComponent(returnTo)}`;
}

export function PlatformCompanyUsersPanel({
  assignHref,
  companyId,
  description = "Manage company owner memberships for this tenant.",
  editHrefBase = `/platform/companies/${companyId}/users`,
  emptyMessage = "No company users yet.",
  inviteHref = `/platform/companies/${companyId}/staff/invite`,
  inviteLabel = "Invite Company User",
  title = "Company users",
  users,
}: PlatformCompanyUsersPanelProps) {
  return (
    <Card className="rounded-xl border-stone-200 bg-white">
      <CardHeader className="flex flex-col gap-4 px-5 pt-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-xl font-semibold text-stone-950">{title}</h3>
          <p className="text-sm text-stone-500">{description}</p>
        </div>
        <div className="flex flex-wrap justify-end gap-3">
          {assignHref ? (
            <Button asChild variant="outline" className="rounded-lg">
              <Link href={assignHref}>
                <ButtonLabel icon={UserCheckIcon}>Assign Existing User</ButtonLabel>
              </Link>
            </Button>
          ) : null}
          {inviteHref ? (
            <Button
              asChild
              className="rounded-lg bg-stone-950 text-white hover:bg-stone-800"
            >
              <Link href={inviteHref}>
                <ButtonLabel icon={UserPlusIcon}>{inviteLabel}</ButtonLabel>
              </Link>
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 px-5 pb-5">
        {users.length === 0 ? (
          <p className="rounded-lg border border-dashed border-stone-200 p-4 text-sm text-stone-500">
            {emptyMessage}
          </p>
        ) : null}

        {users.map((user) => (
          <div
            key={user.membershipId}
            className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-stone-200 bg-stone-50 p-4"
          >
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold text-stone-950">{user.name}</p>
                <StatusPill tone={user.isActive ? "success" : "warning"}>
                  {user.isActive ? "Access Active" : "Access Disabled"}
                </StatusPill>
                <StatusPill
                  tone={user.userStatus === "ACTIVE" ? "success" : "warning"}
                >
                  Account {user.userStatus.toLowerCase()}
                </StatusPill>
              </div>
              <p className="mt-1 text-sm text-stone-500">
                {user.username} - {user.email}
              </p>
              <p className="mt-1 text-xs text-stone-400">
                {formatRole(user.role)}
                {user.accessLabel ? ` - ${user.accessLabel}` : ""} - updated{" "}
                {formatDate(user.updatedAt)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <DesktopQuickAction
                href={`${editHrefBase}/${user.membershipId}`}
                icon={PencilIcon}
                label={`Edit access for ${user.name}`}
              />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="rounded-lg border-stone-300 bg-white text-stone-900 hover:bg-stone-100"
                    aria-label={`Open actions for ${user.name}`}
                  >
                    <MoreHorizontalIcon className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-white text-stone-950">
                  <DropdownMenuLabel>User actions</DropdownMenuLabel>
                  <DropdownMenuItem asChild>
                    <Link href={`${editHrefBase}/${user.membershipId}`}>Edit access</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href={getAccountHref(user.membershipId, editHrefBase)}>
                      <ButtonLabel icon={UserPenIcon}>Edit account details</ButtonLabel>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href={getResetHref(user.membershipId, editHrefBase)}>
                      Create reset link
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
