"use client";

import { useEffect, useState } from "react";
import { BellRingIcon, SendIcon } from "lucide-react";
import { toast } from "sonner";

import {
  fetchJson,
  getCaughtErrorMessage,
  requestJson,
} from "@/lib/api-client";
import {
  ReportBreakdown,
  type ReportBreakdownRow,
} from "@/components/admin/ReportBreakdown";
import { SummaryCards } from "@/components/admin/SummaryCards";
import { Spinner } from "@/components/shared/Spinner";
import { ButtonLabel } from "@/components/shared/ButtonLabel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type PlatformSummary = {
  companyTenants: number;
  restaurantTenants: number;
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

type PlatformSummaryResponse = {
  breakdown?: PlatformReport[];
  summary?: PlatformSummary;
};

export function PlatformDashboardPanel() {
  const [summary, setSummary] = useState<PlatformSummary | null>(null);
  const [breakdown, setBreakdown] = useState<PlatformReport[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isTestingAlerts, setIsTestingAlerts] = useState(false);

  useEffect(() => {
    async function loadDashboard() {
      try {
        const payload = await fetchJson<PlatformSummaryResponse>("/api/platform/summary");
        setSummary(payload.summary ?? null);
        setBreakdown(payload.breakdown ?? []);
        setError(null);
      } catch (caught) {
        setError(getCaughtErrorMessage(caught));
        setIsLoading(false);
        return;
      }

      setIsLoading(false);
    }

    void loadDashboard();
  }, []);

  async function sendTestAlert() {
    setIsTestingAlerts(true);

    try {
      await requestJson("/api/platform/operational-alerts/test", {
        fallbackError: "The operational alert could not be sent.",
      });
      toast.success("Test alert sent.");
    } catch (caught) {
      toast.error(
        getCaughtErrorMessage(caught, "The operational alert could not be sent."),
      );
    } finally {
      setIsTestingAlerts(false);
    }
  }

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

      <Card className="rounded-xl border-stone-200 bg-white">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="flex items-center gap-3">
            <BellRingIcon className="size-5 text-stone-600" />
            <h2 className="text-base font-semibold text-stone-950">
              Operational alerts
            </h2>
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={isTestingAlerts}
            onClick={() => void sendTestAlert()}
          >
            <ButtonLabel icon={SendIcon}>
              {isTestingAlerts ? "Sending..." : "Send test alert"}
            </ButtonLabel>
          </Button>
        </CardContent>
      </Card>

      <ReportBreakdown
        title="Company activity"
        description="Compare parent companies by restaurants, staff and order activity."
        emptyMessage="No company activity to report yet."
        rows={breakdown}
        showChildRestaurants
      />
    </div>
  );
}
