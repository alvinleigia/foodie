"use client";

import { useEffect, useState } from "react";

import { OperationalReports } from "@/components/admin/OperationalReports";
import { ReportsSectionSkeleton } from "@/components/shared/SectionSkeletons";
import { fetchJson, getCaughtErrorMessage } from "@/lib/api-client";
import type { OperationalReport, ReportRange } from "@/lib/saas-reports";

type RestaurantReportResponse = {
  report: OperationalReport;
};

export function RestaurantReportsPanel() {
  const [report, setReport] = useState<OperationalReport | null>(null);
  const [range, setRange] = useState<ReportRange>("30d");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadReport(nextRange: ReportRange) {
    setRange(nextRange);
    setIsLoading(true);

    try {
      const payload = await fetchJson<RestaurantReportResponse>(
        `/api/tenant/reports?range=${nextRange}`,
      );
      setReport(payload.report);
      setError(null);
    } catch (caught) {
      setError(getCaughtErrorMessage(caught));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    let isActive = true;

    void fetchJson<RestaurantReportResponse>("/api/tenant/reports?range=30d")
      .then((payload) => {
        if (isActive) {
          setReport(payload.report);
          setError(null);
        }
      })
      .catch((caught: unknown) => {
        if (isActive) {
          setError(getCaughtErrorMessage(caught));
        }
      })
      .finally(() => {
        if (isActive) {
          setIsLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, []);

  if (isLoading && !report) {
    return <ReportsSectionSkeleton label="Loading restaurant reports" />;
  }

  if (error && !report) {
    return <p className="text-sm text-rose-600">{error}</p>;
  }

  return report ? (
    <div className="grid gap-4">
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      <OperationalReports
        exportHref={`/api/tenant/reports/export?range=${range}`}
        isLoading={isLoading}
        range={range}
        report={report}
        onRangeChange={(nextRange) => void loadReport(nextRange)}
      />
    </div>
  ) : null;
}
