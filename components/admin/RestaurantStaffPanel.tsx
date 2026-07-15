import Link from "next/link";
import {
  ArrowLeftIcon,
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

type RestaurantStaffUser = {
  membershipId: string;
  username: string;
  name: string;
  email: string;
  userStatus: string;
  role: MembershipRole;
  isActive: boolean;
  accessLabel?: string;
  updatedAt: string;
};

type RestaurantStaffPanelProps = {
  assignHref: string;
  backHref: string;
  currentHref: string;
  inviteHref: string;
  restaurantName: string;
  staff: RestaurantStaffUser[];
};

export function RestaurantStaffPanel({
  assignHref,
  backHref,
  currentHref,
  inviteHref,
  restaurantName,
  staff,
}: RestaurantStaffPanelProps) {
  return (
    <div className="grid gap-6">
      <Card className="rounded-xl border-stone-200 bg-white">
        <CardHeader className="flex flex-col gap-4 px-5 pt-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-xl font-semibold text-stone-950">
              Existing staff
            </h3>
            <p className="text-sm text-stone-500">
              Review staff assigned to {restaurantName}, assign an accepted user, or
              invite someone new.
            </p>
          </div>
          <div className="flex flex-wrap justify-end gap-3">
            <Button asChild variant="outline" className="rounded-lg">
              <Link href={assignHref}>
                <ButtonLabel icon={UserCheckIcon}>Assign Existing Staff</ButtonLabel>
              </Link>
            </Button>
            <Button asChild className="rounded-lg bg-stone-950 text-white hover:bg-stone-800">
              <Link href={inviteHref}>
                <ButtonLabel icon={UserPlusIcon}>Invite Staff</ButtonLabel>
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 px-5 pb-5">
          {staff.length === 0 ? (
            <p className="rounded-lg border border-dashed border-stone-200 p-4 text-sm text-stone-500">
              No staff users are assigned to this restaurant yet.
            </p>
          ) : null}

          {staff.map((user) => (
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
                  {user.role.replaceAll("_", " ")}
                  {user.accessLabel ? ` - ${user.accessLabel}` : ""} - updated{" "}
                  {formatAppDate(user.updatedAt)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <DesktopQuickAction
                  href={`/company/users/${user.membershipId}?returnTo=${encodeURIComponent(currentHref)}`}
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
                    <DropdownMenuLabel>Staff actions</DropdownMenuLabel>
                    <DropdownMenuItem asChild>
                      <Link
                        href={`/company/users/${user.membershipId}?returnTo=${encodeURIComponent(currentHref)}`}
                      >
                        Edit access
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link
                        href={`/users/${user.membershipId}/account?returnTo=${encodeURIComponent(currentHref)}`}
                      >
                        <ButtonLabel icon={UserPenIcon}>Edit account details</ButtonLabel>
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link
                        href={`/users/${user.membershipId}/reset-password?returnTo=${encodeURIComponent(currentHref)}`}
                      >
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

      <Button asChild variant="outline" className="w-fit rounded-lg">
        <Link href={backHref}>
          <ButtonLabel icon={ArrowLeftIcon}>Back to restaurant</ButtonLabel>
        </Link>
      </Button>
    </div>
  );
}
