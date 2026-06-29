"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MoreHorizontalIcon } from "lucide-react";

import { getApiError } from "@/lib/api-client";
import { OperationalReports } from "@/components/admin/OperationalReports";
import { SummaryCards } from "@/components/admin/SummaryCards";
import { SectionHeader } from "@/components/shared/SectionHeader";
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
          <Link href="/company">Go to Company</Link>
        </Button>
      </div>
    </div>
  );
}

export function RestaurantAdminPanel() {
  const [snapshot, setSnapshot] = useState<TenantAdminSnapshot | null>(null);
  const [summary, setSummary] = useState<RestaurantSummary | null>(null);
  const [report, setReport] = useState<OperationalReport | null>(null);
  const [reportRange, setReportRange] = useState<ReportRange>("30d");
  const [isReportLoading, setIsReportLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadTenantAdmin() {
      const [adminResponse, summaryResponse] = await Promise.all([
        fetch("/api/tenant/admin"),
        fetch("/api/tenant/summary?range=30d"),
      ]);
      const payload = await adminResponse.json();

      if (!adminResponse.ok) {
        setError(getApiError(payload));
        return;
      }

      if (summaryResponse.ok) {
        const summaryPayload = await summaryResponse.json();
        setSummary(summaryPayload.summary ?? null);
        setReport(summaryPayload.report ?? null);
      }

      setSnapshot(payload);
      setError(null);
    }

    void loadTenantAdmin();
  }, []);

  const qrPath = snapshot?.location?.qrSlug
    ? `/order?qr=${snapshot.location.qrSlug}`
    : null;

  async function refreshReport(nextRange: ReportRange) {
    setReportRange(nextRange);
    setIsReportLoading(true);

    const response = await fetch(`/api/tenant/summary?range=${nextRange}`);
    const payload = await response.json();

    if (response.ok) {
      setSummary(payload.summary ?? null);
      setReport(payload.report ?? null);
      setError(null);
    } else {
      setError(getApiError(payload));
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

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="rounded-xl border-stone-200 bg-white">
              <CardHeader className="flex flex-row items-start justify-between gap-4 px-5 pt-5">
                <SectionHeader
                  eyebrow="Restaurant"
                  title={snapshot.organization?.name ?? "Restaurant"}
                  meta="Restaurant-level settings."
                  className="mb-0"
                />
                <Button asChild variant="outline" className="rounded-lg">
                  <Link href="/restaurant/settings">Edit</Link>
                </Button>
              </CardHeader>
              <CardContent className="px-5 pb-5 text-sm text-stone-600">
                <p>Slug: {snapshot.organization?.slug ?? "-"}</p>
                <p>Timezone: {snapshot.organization?.timezone ?? "-"}</p>
                <p>Currency: {snapshot.organization?.currency ?? "-"}</p>
              </CardContent>
            </Card>

            <Card className="rounded-xl border-stone-200 bg-white">
              <CardHeader className="flex flex-row items-start justify-between gap-4 px-5 pt-5">
                <SectionHeader
                  eyebrow="Location"
                  title={snapshot.location?.name ?? "Location"}
                  meta={snapshot.location?.label ?? "Current operating location."}
                  className="mb-0"
                />
                <Button asChild variant="outline" className="rounded-lg">
                  <Link href="/restaurant/location">Edit</Link>
                </Button>
              </CardHeader>
              <CardContent className="px-5 pb-5 text-sm text-stone-600">
                <p>Timezone: {snapshot.location?.timezone ?? "-"}</p>
                <p>QR slug: {snapshot.location?.qrSlug ?? "Not set"}</p>
                <p>Customer link: {qrPath ?? "Add QR slug to generate link"}</p>
              </CardContent>
            </Card>
          </div>

          <Card className="rounded-xl border-stone-200 bg-white">
            <CardHeader className="flex flex-row items-start justify-between gap-4 px-5 pt-5">
              <div>
                <h3 className="text-xl font-semibold text-stone-950">Staff users</h3>
                <p className="mt-1 text-sm text-stone-500">
                  Existing users assigned to this location.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild className="rounded-lg">
                  <Link href="/restaurant/staff/invite">Invite staff</Link>
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
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </CardContent>
          </Card>
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
