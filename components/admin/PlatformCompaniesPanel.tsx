"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MoreHorizontalIcon } from "lucide-react";

import { Spinner } from "@/components/shared/Spinner";
import {
  ReportBreakdown,
  type ReportBreakdownRow,
} from "@/components/admin/ReportBreakdown";
import { SummaryCards } from "@/components/admin/SummaryCards";
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

type CompanyOrganization = {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  currency: string;
  isActive: boolean;
  subscription: {
    id: string;
    status: "TRIALING" | "ACTIVE" | "PAST_DUE" | "SUSPENDED" | "CANCELLED";
    trialEndsAt: string | null;
    currentPeriodEndsAt: string | null;
    plan: {
      name: string;
      slug: string;
      monthlyPrice: string;
      maxRestaurants: number;
      maxLocations: number;
      maxUsers: number;
      maxMonthlyOrders: number;
      storageMb: number;
    } | null;
  } | null;
};

type PlatformSummary = {
  companyTenants: number;
  restaurantTenants: number;
  activeLocations: number;
  activeStaffMemberships: number;
  activeOrders: number;
  completedOrders: number;
  commercial: {
    activePlans: number;
    trialingCompanies: number;
    activeCompanies: number;
    suspendedCompanies: number;
    cancelledCompanies: number;
    monthlyOrders: number;
  };
};

type PlatformReport = ReportBreakdownRow & {
  childRestaurants: number;
};

function getApiError(payload: unknown) {
  if (payload && typeof payload === "object" && "error" in payload) {
    const error = (payload as { error?: unknown }).error;

    if (typeof error === "string") {
      return error;
    }
  }

  return "Action failed.";
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "Not set";
  }

  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
    new Date(value),
  );
}

function formatStatus(status: string | null | undefined) {
  return status ? status.replaceAll("_", " ").toLowerCase() : "not configured";
}

export function PlatformCompaniesPanel() {
  const [companies, setCompanies] = useState<CompanyOrganization[]>([]);
  const [summary, setSummary] = useState<PlatformSummary | null>(null);
  const [breakdown, setBreakdown] = useState<PlatformReport[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  async function refreshPlatformSummary() {
    const summaryResponse = await fetch("/api/platform/summary");

    if (!summaryResponse.ok) {
      return;
    }

    const summaryPayload = await summaryResponse.json();
    setSummary(summaryPayload.summary ?? null);
    setBreakdown(summaryPayload.breakdown ?? []);
  }

  useEffect(() => {
    async function loadCompanies() {
      const companiesResponse = await fetch("/api/platform/companies");
      const payload = await companiesResponse.json();

      if (!companiesResponse.ok) {
        setError(getApiError(payload));
        setIsLoading(false);
        return;
      }

      setCompanies(payload.companies ?? []);
      await refreshPlatformSummary();

      setError(null);
      setIsLoading(false);
    }

    void loadCompanies();
  }, []);

  return (
    <div className="grid gap-6">
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      {summary ? (
        <SummaryCards
          cards={[
            {
              label: "Companies",
              value: summary.companyTenants,
              helper: "Parent company tenants.",
            },
            {
              label: "Restaurants",
              value: summary.restaurantTenants,
              helper: "Child restaurant tenants across the platform.",
            },
            {
              label: "Active orders",
              value: summary.activeOrders,
              helper: "Pending, preparing or ready orders.",
            },
            {
              label: "Locations",
              value: summary.activeLocations,
              helper: "Active restaurant locations.",
            },
            {
              label: "Staff memberships",
              value: summary.activeStaffMemberships,
              helper: "Active user assignments.",
            },
            {
              label: "Non-cancelled orders",
              value: summary.completedOrders,
              helper: "All-time orders excluding cancellations.",
            },
            {
              label: "Trial companies",
              value: summary.commercial.trialingCompanies,
              helper: "Company tenants currently on trial.",
            },
            {
              label: "Active subscriptions",
              value: summary.commercial.activeCompanies,
              helper: "Company tenants marked active.",
            },
            {
              label: "Suspended tenants",
              value: summary.commercial.suspendedCompanies,
              helper: "Commercially suspended company tenants.",
            },
            {
              label: "Monthly orders",
              value: summary.commercial.monthlyOrders,
              helper: "Orders created since the first day of this month.",
            },
            {
              label: "Active plans",
              value: summary.commercial.activePlans,
              helper: "Configured SaaS plans available for tenants.",
            },
          ]}
        />
      ) : null}

      <ReportBreakdown
        title="Company activity"
        description="Compare parent companies by restaurants, locations, staff and order activity."
        emptyMessage="No company activity to report yet."
        rows={breakdown}
        showChildRestaurants
      />

      <Card className="rounded-xl border-stone-200 bg-white">
        <CardHeader className="flex flex-col gap-4 px-5 pt-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-xl font-semibold text-stone-950">Parent companies</h3>
            <p className="text-sm text-stone-500">
              Manage company tenants from cards. Creation, editing and risky actions live on focused pages.
            </p>
          </div>
          <Button
            asChild
            className="rounded-lg bg-stone-950 text-white hover:bg-stone-800"
          >
            <Link href="/platform/companies/new">Add Company</Link>
          </Button>
        </CardHeader>
        <CardContent className="grid gap-3 px-5 pb-5">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-stone-500">
              <Spinner className="text-stone-500" />
              Loading companies...
            </div>
          ) : null}

          {!isLoading && companies.length === 0 ? (
            <p className="rounded-lg border border-dashed border-stone-200 p-4 text-sm text-stone-500">
              No parent companies yet.
            </p>
          ) : null}

          {companies.map((company) => (
            <div
              key={company.id}
              className="grid gap-4 rounded-lg border border-stone-200 bg-stone-50 p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-stone-950">{company.name}</p>
                  <p className="text-sm text-stone-500">
                    {company.slug} - {company.timezone} - {company.currency}
                  </p>
                  <p className="mt-1 text-xs text-stone-400">
                    {company.subscription?.plan?.name ?? "No plan"} -{" "}
                    {formatStatus(company.subscription?.status)} - Trial ends:{" "}
                    {formatDate(company.subscription?.trialEndsAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-md border border-stone-200 bg-white px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                    {company.isActive ? "Active" : "Disabled"}
                  </span>
                  <span className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-amber-800">
                    {company.subscription?.status ?? "No subscription"}
                  </span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="rounded-lg border-stone-300 bg-white text-stone-900 hover:bg-stone-100"
                        aria-label={`Open actions for ${company.name}`}
                      >
                        <MoreHorizontalIcon className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-white text-stone-950">
                      <DropdownMenuLabel>Company actions</DropdownMenuLabel>
                      <DropdownMenuItem asChild>
                        <Link href={`/platform/companies/${company.id}`}>Edit details</Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href={`/platform/companies/${company.id}/staff/invite`}>
                          Invite company user
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <a href={`/api/platform/companies/${company.id}/export`}>
                          Export company data
                        </a>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href={`/platform/companies/${company.id}/subscription`}>
                          Subscription settings
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator className="bg-stone-200" />
                      <DropdownMenuItem asChild variant="destructive">
                        <Link href={`/platform/companies/${company.id}/delete`}>
                          Delete company
                        </Link>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              {company.subscription?.plan ? (
                <div className="grid gap-2 rounded-lg border border-stone-200 bg-white p-3 text-sm text-stone-600 md:grid-cols-5">
                  <CommercialMetric
                    label="Plan"
                    value={`${company.subscription.plan.name} / ${company.subscription.plan.monthlyPrice}`}
                  />
                  <CommercialMetric
                    label="Restaurants"
                    value={company.subscription.plan.maxRestaurants}
                  />
                  <CommercialMetric
                    label="Locations"
                    value={company.subscription.plan.maxLocations}
                  />
                  <CommercialMetric
                    label="Users"
                    value={company.subscription.plan.maxUsers}
                  />
                  <CommercialMetric
                    label="Monthly orders"
                    value={company.subscription.plan.maxMonthlyOrders}
                  />
                </div>
              ) : null}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function CommercialMetric({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-400">
        {label}
      </p>
      <p className="mt-1 font-semibold text-stone-950">{value}</p>
    </div>
  );
}
