"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  BuildingIcon,
  MapPinIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  UsersIcon,
} from "lucide-react";
import { toast } from "sonner";

import { fetchJson, getCaughtErrorMessage, requestJson } from "@/lib/api-client";
import { ButtonLabel } from "@/components/shared/ButtonLabel";
import { DesktopQuickAction } from "@/components/shared/DesktopQuickAction";
import { Spinner } from "@/components/shared/Spinner";
import {
  ReportBreakdown,
  type ReportBreakdownRow,
} from "@/components/admin/ReportBreakdown";
import { OperationalReports } from "@/components/admin/OperationalReports";
import { SummaryCards } from "@/components/admin/SummaryCards";
import { SectionHeader } from "@/components/shared/SectionHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { OperationalReport, ReportRange } from "@/lib/saas-reports";

type CompanyRestaurant = {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  currency: string;
  isActive: boolean;
  locations: {
    id: string;
    slug: string;
    qrSlug: string | null;
    name: string;
    label: string | null;
    timezone: string;
    isActive: boolean;
  }[];
  locationsCount: number;
  primaryLocation: {
    name: string;
    label: string | null;
    slug: string;
  } | null;
};

type CompanySummary = {
  childRestaurants: number;
  activeLocations: number;
  activeStaffMemberships: number;
  activeMenuCategories: number;
  activeMenuItems: number;
  activeOrders: number;
  completedOrders: number;
};

type RestaurantsMutationResponse = {
  restaurants?: CompanyRestaurant[];
};

type CompanyRestaurantsResponse = {
  restaurants?: CompanyRestaurant[];
};

type CompanySummaryResponse = {
  breakdown?: ReportBreakdownRow[];
  report?: OperationalReport;
  summary?: CompanySummary;
};

type CompanyRestaurantsPanelProps = {
  hasRealCompanyContext: boolean;
};

function CompanySetupRequired() {
  return (
    <Card className="rounded-xl border-stone-200 bg-white">
      <CardHeader className="px-5 pt-5">
        <SectionHeader
          eyebrow="Company"
          title="Create a parent company first"
          meta="The bootstrap system company is hidden from admin workspaces."
          className="mb-0"
        />
      </CardHeader>
      <CardContent className="px-5 pb-5">
        <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50/80 p-6">
          <p className="text-sm leading-6 text-stone-600">
            You are signed in as the SaaS owner. Start from Platform, create a
            parent company, then invite a company owner or manager to operate this
            workspace.
          </p>
          <div className="mt-5">
            <Button asChild>
              <Link href="/platform">
                <ButtonLabel icon={BuildingIcon}>Go to Platform</ButtonLabel>
              </Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function CompanyRestaurantsPanel({
  hasRealCompanyContext,
}: CompanyRestaurantsPanelProps) {
  const [restaurants, setRestaurants] = useState<CompanyRestaurant[]>([]);
  const [summary, setSummary] = useState<CompanySummary | null>(null);
  const [report, setReport] = useState<OperationalReport | null>(null);
  const [reportRange, setReportRange] = useState<ReportRange>("30d");
  const [breakdown, setBreakdown] = useState<ReportBreakdownRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(hasRealCompanyContext);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  async function refreshCompanySummary(range = reportRange) {
    let summaryPayload: CompanySummaryResponse;

    try {
      summaryPayload = await fetchJson(`/api/company/summary?range=${range}`);
    } catch {
      return;
    }

    setSummary(summaryPayload.summary ?? null);
    setBreakdown(summaryPayload.breakdown ?? []);
    setReport(summaryPayload.report ?? null);
  }

  useEffect(() => {
    if (!hasRealCompanyContext) {
      return;
    }

    async function loadRestaurants() {
      try {
        const [payload, summaryPayload] = await Promise.all([
          fetchJson<CompanyRestaurantsResponse>("/api/company/restaurants"),
          fetchJson<CompanySummaryResponse>("/api/company/summary?range=30d").catch(() => null),
        ]);

        setRestaurants(payload.restaurants ?? []);

        if (summaryPayload) {
          setSummary(summaryPayload.summary ?? null);
          setBreakdown(summaryPayload.breakdown ?? []);
          setReport(summaryPayload.report ?? null);
        }

        setError(null);
      } catch (caught) {
        setError(getCaughtErrorMessage(caught));
        setIsLoading(false);
        return;
      }

      setIsLoading(false);
    }

    void loadRestaurants();
  }, [hasRealCompanyContext]);

  async function submitJson(path: string, body: unknown, action: string) {
    setPendingAction(action);

    let payload: RestaurantsMutationResponse;

    try {
      payload = await requestJson(path, {
        body,
        method: path === "/api/company/restaurants" || path.endsWith("/staff") ? "POST" : "PATCH",
      });
    } catch (caught) {
      const message = getCaughtErrorMessage(caught);
      setError(message);
      toast.error(message);
      setPendingAction(null);
      return;
    }

    setRestaurants(payload.restaurants ?? []);
    await refreshCompanySummary(reportRange);
    setError(null);
    setPendingAction(null);
    toast.success("Restaurants updated.");
  }

  return (
    <div className="grid gap-6">
      {!hasRealCompanyContext ? <CompanySetupRequired /> : null}

      {hasRealCompanyContext ? (
        <>
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      {summary ? (
        <SummaryCards
          cards={[
            {
              label: "Restaurants",
              value: summary.childRestaurants,
              helper: "Child restaurant tenants in this company.",
            },
            {
              label: "Locations",
              value: summary.activeLocations,
              helper: "Active child restaurant locations.",
            },
            {
              label: "Active orders",
              value: summary.activeOrders,
              helper: "Pending, preparing or ready orders.",
            },
            {
              label: "Staff memberships",
              value: summary.activeStaffMemberships,
              helper: "Active child restaurant staff assignments.",
            },
            {
              label: "Menu categories",
              value: summary.activeMenuCategories,
              helper: "Active menu sections across child restaurants.",
            },
            {
              label: "Menu items",
              value: summary.activeMenuItems,
              helper: "Active products across child restaurants.",
            },
            {
              label: "Non-cancelled orders",
              value: summary.completedOrders,
              helper: "All-time child restaurant orders excluding cancellations.",
            },
          ]}
        />
      ) : null}

      <ReportBreakdown
        title="Restaurant activity"
        description="Compare child restaurants by locations, staff and order activity."
        emptyMessage="No restaurant activity to report yet."
        rows={breakdown}
      />

      {report ? (
        <OperationalReports
          exportHref={`/api/company/reports/export?range=${reportRange}`}
          isLoading={isLoading}
          range={reportRange}
          report={report}
          onRangeChange={(nextRange) => {
            setReportRange(nextRange);
            void refreshCompanySummary(nextRange);
          }}
        />
      ) : null}

      <Card className="rounded-xl border-stone-200 bg-white">
        <CardHeader className="flex flex-row items-start justify-between gap-4 px-5 pt-5">
          <div>
            <h3 className="text-xl font-semibold text-stone-950">Restaurants</h3>
            <p className="text-sm text-stone-500">
              Create a restaurant only when you are ready to add its first location.
            </p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button asChild variant="outline" className="rounded-lg">
              <Link href="/company/users">
                <ButtonLabel icon={UsersIcon}>Manage users</ButtonLabel>
              </Link>
            </Button>
            <Button asChild className="rounded-lg">
              <Link href="/company/restaurants/new">
                <ButtonLabel icon={PlusIcon}>Add restaurant</ButtonLabel>
              </Link>
            </Button>
          </div>
        </CardHeader>
      </Card>

      <Card className="rounded-xl border-stone-200 bg-white">
        <CardHeader className="px-5 pt-5">
          <h3 className="text-xl font-semibold text-stone-950">Child restaurants</h3>
        </CardHeader>
        <CardContent className="grid gap-3 px-5 pb-5">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-stone-500">
              <Spinner className="text-stone-500" />
              Loading restaurants...
            </div>
          ) : null}

          {!isLoading && restaurants.length === 0 ? (
            <p className="rounded-lg border border-dashed border-stone-200 p-4 text-sm text-stone-500">
              No child restaurants yet.
            </p>
          ) : null}

          {restaurants.map((restaurant) => {
            return (
            <div
              key={restaurant.id}
              className="grid gap-4 rounded-lg border border-stone-200 bg-stone-50 p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-stone-950">{restaurant.name}</p>
                  <p className="text-sm text-stone-500">
                    {restaurant.slug} - {restaurant.timezone} - {restaurant.currency}
                  </p>
                  <p className="mt-1 text-xs text-stone-400">
                    {restaurant.locationsCount} location
                    {restaurant.locationsCount === 1 ? "" : "s"}
                    {restaurant.primaryLocation
                      ? ` - Primary: ${restaurant.primaryLocation.name}`
                      : " - No location yet"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-md border border-stone-200 bg-white px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                    {restaurant.isActive ? "Active" : "Disabled"}
                  </span>
                  <DesktopQuickAction
                    href={`/company/restaurants/${restaurant.id}`}
                    icon={PencilIcon}
                    label={`Edit ${restaurant.name} settings`}
                  />
                  <DesktopQuickAction
                    href={`/company/restaurants/${restaurant.id}/locations`}
                    icon={MapPinIcon}
                    label={`Manage locations for ${restaurant.name}`}
                  />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        disabled={Boolean(pendingAction)}
                        className="rounded-lg border-stone-300 bg-white text-stone-900 hover:bg-stone-100"
                        aria-label={`Open actions for ${restaurant.name}`}
                      >
                        <MoreHorizontalIcon className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-white text-stone-950">
                      <DropdownMenuLabel>Restaurant actions</DropdownMenuLabel>
                      <DropdownMenuItem asChild>
                        <Link href={`/company/restaurants/${restaurant.id}`}>
                          Edit restaurant settings
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href={`/company/restaurants/${restaurant.id}/locations`}>
                          Manage locations
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator className="bg-stone-200" />
                      <DropdownMenuItem
                        variant={restaurant.isActive ? "destructive" : "default"}
                        onSelect={() =>
                          void submitJson(
                            `/api/company/restaurants/${restaurant.id}`,
                            { ...restaurant, isActive: !restaurant.isActive },
                            `toggle:${restaurant.id}`,
                          )
                        }
                      >
                        {restaurant.isActive ? "Disable restaurant" : "Enable restaurant"}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </div>
            );
          })}
        </CardContent>
      </Card>
        </>
      ) : null}
    </div>
  );
}
