"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  BuildingIcon,
  MapPinIcon,
  MoreHorizontalIcon,
  PencilIcon,
  SettingsIcon,
  UserCheckIcon,
  UserPlusIcon,
  UsersIcon,
} from "lucide-react";

import { fetchJson, getCaughtErrorMessage } from "@/lib/api-client";
import { OperationalReports } from "@/components/admin/OperationalReports";
import { ButtonLabel } from "@/components/shared/ButtonLabel";
import { DesktopQuickAction } from "@/components/shared/DesktopQuickAction";
import { SummaryCards } from "@/components/admin/SummaryCards";
import { Spinner } from "@/components/shared/Spinner";
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
import type { MembershipRole } from "@/lib/staff-auth";

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
  location: {
    id: string;
    name: string;
    slug: string;
    qrSlug: string | null;
    label: string | null;
    timezone: string;
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
    locationId: string | null;
    createdAt: string;
  }>;
};

type RestaurantSummary = {
  activeLocations: number;
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
  return error?.toLowerCase().includes("missing tenant or location access") ?? false;
}

function RestaurantAccessEmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50/80 p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[rgb(199,76,0)]">
        Setup Required
      </p>
      <h3 className="mt-3 text-2xl font-semibold text-stone-950">
        No restaurant location is assigned yet
      </h3>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
        Restaurant settings need a specific restaurant and location membership.
        Create a restaurant/location from Company, then invite a restaurant manager.
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/company">
            <ButtonLabel icon={BuildingIcon}>Go to Company</ButtonLabel>
          </Link>
        </Button>
      </div>
    </div>
  );
}

export function RestaurantAdminPanel({
  view = "dashboard",
}: {
  view?: "dashboard" | "staff";
}) {
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
          fetchJson<RestaurantSummaryResponse>("/api/tenant/summary?range=30d").catch(() => null),
        ]);

        if (summaryPayload) {
          setSummary(summaryPayload.summary ?? null);
          setReport(summaryPayload.report ?? null);
        }

        setSnapshot(payload);
        setError(null);
      } catch (caught) {
        setError(getCaughtErrorMessage(caught));
        return;
      }
    }

    void loadTenantAdmin();
  }, []);

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
          {summary ? (
            <SummaryCards
              cards={[
                {
                  label: "Locations",
                  value: summary.activeLocations,
                  helper: "Active locations under this restaurant.",
                },
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

          {report ? (
            <OperationalReports
              exportHref={`/api/tenant/reports/export?range=${reportRange}`}
              isLoading={isReportLoading}
              range={reportRange}
              report={report}
              onRangeChange={(nextRange) => void refreshReport(nextRange)}
            />
          ) : null}

          {view === "dashboard" ? (
            <Card className="rounded-xl border-stone-200 bg-white">
              <CardHeader className="flex flex-row items-start justify-between gap-4 px-5 pt-5">
                <div>
                  <h3 className="text-xl font-semibold text-stone-950">
                    Management shortcuts
                  </h3>
                  <p className="text-sm text-stone-500">
                    Use focused screens for setup, staff, orders, menu and inventory.
                  </p>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button asChild variant="outline" className="rounded-lg">
                    <Link href="/restaurant/settings">
                      <ButtonLabel icon={SettingsIcon}>Restaurant settings</ButtonLabel>
                    </Link>
                  </Button>
                  <Button asChild variant="outline" className="rounded-lg">
                    <Link href="/restaurant/location">
                      <ButtonLabel icon={MapPinIcon}>Location settings</ButtonLabel>
                    </Link>
                  </Button>
                  <Button asChild className="rounded-lg">
                    <Link href="/restaurant/staff">
                      <ButtonLabel icon={UsersIcon}>Manage staff</ButtonLabel>
                    </Link>
                  </Button>
                </div>
              </CardHeader>
            </Card>
          ) : null}

          {view === "staff" ? (
          <Card className="rounded-xl border-stone-200 bg-white">
            <CardHeader className="flex flex-row items-start justify-between gap-4 px-5 pt-5">
              <div>
                <h3 className="text-xl font-semibold text-stone-950">Staff users</h3>
                <p className="mt-1 text-sm text-stone-500">
                  Existing users assigned to this location.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" className="rounded-lg">
                  <Link href="/restaurant/staff/reassign">
                    <ButtonLabel icon={UserCheckIcon}>Assign existing staff</ButtonLabel>
                  </Link>
                </Button>
                <Button asChild className="rounded-lg">
                  <Link href="/restaurant/staff/invite">
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
                      <span className="rounded-md border border-stone-200 bg-white px-2 py-0.5 text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                        {staff.isActive ? "Active" : "Disabled"}
                      </span>
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
                      href={`/restaurant/staff/${staff.membershipId}`}
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
                          <Link href={`/restaurant/staff/${staff.membershipId}`}>
                            Edit access
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link
                            href={`/users/${staff.membershipId}/reset-password?returnTo=/restaurant`}
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
