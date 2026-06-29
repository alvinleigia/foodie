import Link from "next/link";
import { MoreHorizontalIcon } from "lucide-react";

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
  updatedAt: string;
};

type PlatformCompanyUsersPanelProps = {
  companyId: string;
  users: CompanyUser[];
};

function formatRole(role: MembershipRole) {
  return role.replaceAll("_", " ");
}

function formatDate(value: string) {
  return formatAppDate(value);
}

export function PlatformCompanyUsersPanel({
  companyId,
  users,
}: PlatformCompanyUsersPanelProps) {
  return (
    <Card className="rounded-xl border-stone-200 bg-white">
      <CardHeader className="flex flex-col gap-4 px-5 pt-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-xl font-semibold text-stone-950">Company users</h3>
          <p className="text-sm text-stone-500">
            Manage company owner and manager memberships for this tenant.
          </p>
        </div>
        <Button
          asChild
          className="rounded-lg bg-stone-950 text-white hover:bg-stone-800"
        >
          <Link href={`/platform/companies/${companyId}/staff/invite`}>
            Invite Company User
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="grid gap-3 px-5 pb-5">
        {users.length === 0 ? (
          <p className="rounded-lg border border-dashed border-stone-200 p-4 text-sm text-stone-500">
            No company users yet.
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
                <span className="rounded-md border border-stone-200 bg-white px-2 py-0.5 text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                  {user.isActive ? "Access Active" : "Access Disabled"}
                </span>
                <span className="rounded-md border border-stone-200 bg-white px-2 py-0.5 text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                  Account {user.userStatus.toLowerCase()}
                </span>
              </div>
              <p className="mt-1 text-sm text-stone-500">
                {user.username} - {user.email}
              </p>
              <p className="mt-1 text-xs text-stone-400">
                {formatRole(user.role)} - updated {formatDate(user.updatedAt)}
              </p>
            </div>
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
                  <Link
                    href={`/platform/companies/${companyId}/users/${user.membershipId}`}
                  >
                    Edit access
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
