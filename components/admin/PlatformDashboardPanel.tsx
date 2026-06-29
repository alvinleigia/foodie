"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { getApiError } from "@/lib/api-client";
import {
  ReportBreakdown,
  type ReportBreakdownRow,
} from "@/components/admin/ReportBreakdown";
import { SummaryCards } from "@/components/admin/SummaryCards";
import { Spinner } from "@/components/shared/Spinner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

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

export function PlatformDashboardPanel({
  uatResetEnabled = false,
}: {
  uatResetEnabled?: boolean;
}) {
  const [summary, setSummary] = useState<PlatformSummary | null>(null);
  const [breakdown, setBreakdown] = useState<PlatformReport[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadDashboard() {
      const response = await fetch("/api/platform/summary");
      const payload = await response.json();

      if (!response.ok) {
        setError(getApiError(payload));
        setIsLoading(false);
        return;
      }

      setSummary(payload.summary ?? null);
      setBreakdown(payload.breakdown ?? []);
      setError(null);
      setIsLoading(false);
    }

    void loadDashboard();
  }, []);

  return (
    <div className="grid gap-6">
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      {isLoading ? (
        <Card className="rounded-xl border-stone-200 bg-white">
          <CardContent className="flex items-center gap-2 p-5 text-sm text-stone-500">
            <Spinner className="text-stone-500" />
            Loading platform dashboard...
          </CardContent>
        </Card>
      ) : null}

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
            <h3 className="text-xl font-semibold text-stone-950">
              Company management
            </h3>
            <p className="text-sm text-stone-500">
              Open the dedicated companies view for tenant CRUD, domains,
              subscriptions and exports.
            </p>
          </div>
          <Button
            asChild
            className="rounded-lg bg-stone-950 text-white hover:bg-stone-800"
          >
            <Link href="/platform/companies">View Companies</Link>
          </Button>
        </CardHeader>
      </Card>

      {uatResetEnabled ? (
        <Card className="rounded-xl border-rose-200 bg-rose-50/70">
          <CardHeader className="flex flex-col gap-4 px-5 pt-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-xl font-semibold text-stone-950">UAT reset</h3>
              <p className="text-sm text-stone-600">
                Clear testing data and keep only the current SaaS owner account.
              </p>
            </div>
            <Button
              asChild
              className="rounded-lg bg-rose-600 text-white hover:bg-rose-700"
            >
              <Link href="/platform/uat-reset">Open Reset</Link>
            </Button>
          </CardHeader>
        </Card>
      ) : null}
    </div>
  );
}
