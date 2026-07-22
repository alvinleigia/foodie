"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  MoreHorizontalIcon,
  PencilIcon,
  UserCheckIcon,
  UserPenIcon,
  UserPlusIcon,
} from "lucide-react";

import { fetchJson, getCaughtErrorMessage } from "@/lib/api-client";
import { OperationalReports } from "@/components/admin/OperationalReports";
import { ButtonLabel } from "@/components/shared/ButtonLabel";
import { DesktopQuickAction } from "@/components/shared/DesktopQuickAction";
import { SummaryCards } from "@/components/admin/SummaryCards";
import { Spinner } from "@/components/shared/Spinner";
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
import type { OperationalReport, ReportRange } from "@/lib/saas-reports";
import {
  getRestaurantStaffMemberHref,
  getRestaurantWorkspaceHref,
} from "@/lib/restaurant-workspace";
import type { MembershipRole } from "@/lib/staff-auth";
import type { StaffPermission } from "@/lib/staff-permissions";

type StaffRole = Exclude<MembershipRole, "PLATFORM_ADMIN">;

type TenantAdminSnapshot = {
  organization: {
    id: string;
    name: string;
    slug: string;
    logoUrl: string | null;
    type: "COMPANY" | "RESTAURANT";
    timezone: string;
    currency: string;
    isActive: boolean;
  } | null;
  orderingPoint: {
    id: string;
    name: string;
    slug: string;
    qrSlug: string | null;
    label: string | null;
    isActive: boolean;
  } | null;
  staff: Array<{
    membershipId: string;
    userId: string;
    username: string;
    name: string;
    email: string;
    status: "INVITED" | "ACTIVE" | "DISABLED";
    role: StaffRole | "PLATFORM_ADMIN";
    isActive: boolean;
    permissions: StaffPermission[];
    createdAt: string;
  }>;
};

type RestaurantSummary = {
  activeStaffMemberships: number;
  activeMenuCategories: number;
  activeMenuItems: number;
  activeOrders: number;
  completedOrders: number;
};

type RestaurantSummaryResponse = {
  report?: OperationalReport;
  summary?: RestaurantSummary;
};

function isMissingTenantAccess(error: string | null) {
  return error?.toLowerCase().includes("missing restaurant access") ?? false;
}

function RestaurantAccessEmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50/80 p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[rgb(199,76,0)]">
        Setup Required
      </p>
      <h3 className="mt-3 text-2xl font-semibold text-stone-950">
        No restaurant is assigned yet
      </h3>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
        Restaurant settings need a restaurant membership. Create a restaurant from
        Company, then invite a restaurant manager.
      </p>
    </div>
  );
}

export function RestaurantAdminPanel({
  restaurantSlug,
  view = "dashboard",
}: {
  restaurantSlug: string;
  view?: "dashboard" | "staff";
}) {
  const staffHref = getRestaurantWorkspaceHref(restaurantSlug, "staff");
  const staffInviteHref = getRestaurantWorkspaceHref(
    restaurantSlug,
    "staffInvite",
  );
  const staffReassignHref = getRestaurantWorkspaceHref(
    restaurantSlug,
    "staffReassign",
  );
  const [snapshot, setSnapshot] = useState<TenantAdminSnapshot | null>(null);
  const [summary, setSummary] = useState<RestaurantSummary | null>(null);
  const [report, setReport] = useState<OperationalReport | null>(null);
  const [reportRange, setReportRange] = useState<ReportRange>("30d");
  const [isReportLoading, setIsReportLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadTenantAdmin() {
      try {
        const [payload, summaryPayload] = await Promise.all([
          fetchJson<TenantAdminSnapshot>("/api/tenant/admin"),
          view === "dashboard"
            ? fetchJson<RestaurantSummaryResponse>("/api/tenant/summary?range=30d").catch(
                () => null,
              )
            : Promise.resolve(null),
        ]);

        if (summaryPayload) {
          setSummary(summaryPayload.summary ?? null);
          setReport(summaryPayload.report ?? null);
        } else {
          setSummary(null);
          setReport(null);
        }

        setSnapshot(payload);
        setError(null);
      } catch (caught) {
        setError(getCaughtErrorMessage(caught));
        return;
      }
    }

    void loadTenantAdmin();
  }, [view]);

  async function refreshReport(nextRange: ReportRange) {
    setReportRange(nextRange);
    setIsReportLoading(true);

    try {
      const payload = await fetchJson<RestaurantSummaryResponse>(
        `/api/tenant/summary?range=${nextRange}`,
      );
      setSummary(payload.summary ?? null);
      setReport(payload.report ?? null);
      setError(null);
    } catch (caught) {
      setError(getCaughtErrorMessage(caught));
    }

    setIsReportLoading(false);
  }

  return (
    <div className="grid gap-6">
      {isMissingTenantAccess(error) ? (
        <RestaurantAccessEmptyState />
      ) : error ? (
        <p className="text-sm text-rose-600">{error}</p>
      ) : null}

      {snapshot ? (
        <>
          {view === "dashboard" && summary ? (
            <SummaryCards
              cards={[
                {
                  label: "Staff",
                  value: summary.activeStaffMemberships,
                  helper: "Active staff memberships.",
                },
                {
                  label: "Menu categories",
                  value: summary.activeMenuCategories,
                  helper: "Active menu sections.",
                },
                {
                  label: "Menu items",
                  value: summary.activeMenuItems,
                  helper: "Active products visible in the menu.",
                },
                {
                  label: "Active orders",
                  value: summary.activeOrders,
                  helper: "Pending, preparing or ready orders.",
                },
                {
                  label: "Non-cancelled orders",
                  value: summary.completedOrders,
                  helper: "All-time orders excluding cancellations.",
                },
              ]}
            />
          ) : null}

          {view === "dashboard" && report ? (
            <OperationalReports
              exportHref={`/api/tenant/reports/export?range=${reportRange}`}
              isLoading={isReportLoading}
              range={reportRange}
              report={report}
              onRangeChange={(nextRange) => void refreshReport(nextRange)}
            />
          ) : null}

          {view === "staff" ? (
            <Card className="rounded-xl border-stone-200 bg-white">
              <CardHeader className="flex flex-row items-start justify-between gap-4 px-5 pt-5">
                <div>
                  <h3 className="text-xl font-semibold text-stone-950">Staff users</h3>
                  <p className="mt-1 text-sm text-stone-500">
                    Existing users assigned to this restaurant.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="outline" className="rounded-lg">
                    <Link href={staffReassignHref}>
                      <ButtonLabel icon={UserCheckIcon}>Assign existing staff</ButtonLabel>
                    </Link>
                  </Button>
                  <Button asChild className="rounded-lg">
                    <Link href={staffInviteHref}>
                      <ButtonLabel icon={UserPlusIcon}>Invite staff</ButtonLabel>
                    </Link>
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="grid gap-3 px-5 pb-5">
                {snapshot.staff.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-stone-200 p-4 text-sm text-stone-500">
                    No staff users yet.
                  </p>
                ) : null}

                {snapshot.staff.map((staff) => (
                  <div
                    key={staff.membershipId}
                    className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-stone-200 bg-stone-50 p-4"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-stone-950">{staff.name}</p>
                        <StatusPill tone={staff.isActive ? "success" : "warning"}>
                          {staff.isActive ? "Active" : "Disabled"}
                        </StatusPill>
                      </div>
                      <p className="mt-1 text-sm text-stone-500">
                        {staff.username} - {staff.email}
                      </p>
                      <p className="mt-1 text-xs text-stone-400">
                        {staff.role.replaceAll("_", " ")} - {staff.status}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <DesktopQuickAction
                        href={getRestaurantStaffMemberHref(
                          restaurantSlug,
                          staff.membershipId,
                        )}
                        icon={PencilIcon}
                        label={`Edit access for ${staff.name}`}
                      />
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="rounded-lg border-stone-300 bg-white text-stone-900 hover:bg-stone-100"
                            aria-label={`Open actions for ${staff.name}`}
                          >
                            <MoreHorizontalIcon className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-white text-stone-950">
                          <DropdownMenuLabel>Staff actions</DropdownMenuLabel>
                          <DropdownMenuItem asChild>
                            <Link
                              href={getRestaurantStaffMemberHref(
                                restaurantSlug,
                                staff.membershipId,
                              )}
                            >
                              Edit access
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link
                              href={`/users/${staff.membershipId}/account?returnTo=${encodeURIComponent(staffHref)}`}
                            >
                              <ButtonLabel icon={UserPenIcon}>
                                Edit account details
                              </ButtonLabel>
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link
                              href={`/users/${staff.membershipId}/reset-password?returnTo=${encodeURIComponent(staffHref)}`}
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
          ) : null}
        </>
      ) : !isMissingTenantAccess(error) ? (
        <div className="flex items-center gap-2 text-sm text-stone-500">
          <Spinner className="text-stone-500" />
          Loading restaurant setup...
        </div>
      ) : null}
    </div>
  );
}
