"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BriefcaseBusinessIcon, SaveIcon } from "lucide-react";
import { toast } from "sonner";

import { ButtonLabel } from "@/components/shared/ButtonLabel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { requestJson } from "@/lib/api-client";
import type { StaffJobAssignment, StaffJobRecord } from "@/types/staff-jobs";

export function StaffJobAssignmentForm({
  initialAssignment,
  jobs,
  jobsHref,
  membershipId,
  staffName,
}: {
  initialAssignment: StaffJobAssignment;
  jobs: StaffJobRecord[];
  jobsHref: string;
  membershipId: string;
  staffName: string;
}) {
  const router = useRouter();
  const [assignment, setAssignment] = useState(initialAssignment);
  const [isSaving, setIsSaving] = useState(false);
  const availableJobs = jobs.filter(
    (job) => job.isActive || assignment.jobIds.includes(job.id),
  );

  function toggleJob(jobId: string, checked: boolean) {
    setAssignment((current) => {
      const jobIds = checked
        ? [...current.jobIds, jobId]
        : current.jobIds.filter((id) => id !== jobId);
      const primaryJobId = checked
        ? current.primaryJobId ?? jobId
        : current.primaryJobId === jobId
          ? jobIds[0] ?? null
          : current.primaryJobId;
      const payRates = checked
        ? current.payRates.some((rate) => rate.jobId === jobId)
          ? current.payRates
          : [...current.payRates, { jobId, hourlyRateMinor: null }]
        : current.payRates.filter((rate) => rate.jobId !== jobId);

      return { ...current, jobIds, payRates, primaryJobId };
    });
  }

  function setPayRate(jobId: string, value: string) {
    const hourlyRateMinor = value === "" ? null : Math.round(Number(value) * 100);

    setAssignment((current) => ({
      ...current,
      payRates: [
        ...current.payRates.filter((rate) => rate.jobId !== jobId),
        { jobId, hourlyRateMinor },
      ],
    }));
  }

  async function save() {
    setIsSaving(true);

    try {
      const response = await requestJson<{ assignment: StaffJobAssignment }>(
        `/api/tenant/admin/staff/${membershipId}/jobs`,
        {
          method: "PUT",
          body: assignment,
        },
      );
      setAssignment(response.assignment);
      toast.success("Staff jobs updated.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update jobs.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card className="rounded-xl">
      <CardHeader className="flex flex-row items-start justify-between gap-4 px-5 pt-5">
        <div>
          <h3 className="text-2xl font-semibold">Assigned jobs</h3>
          <p className="text-sm text-muted-foreground">{staffName}</p>
        </div>
        <Button asChild type="button" variant="outline">
          <Link href={jobsHref}>
            <ButtonLabel icon={BriefcaseBusinessIcon}>Manage jobs</ButtonLabel>
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="grid gap-4 px-5 pb-5">
        <label className="grid max-w-md gap-1.5 text-sm font-medium">
          Payroll employee reference
          <input
            type="text"
            maxLength={80}
            value={assignment.payrollEmployeeReference ?? ""}
            placeholder="For example, EMP-001"
            className="h-10 rounded-lg border border-input bg-background px-3 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            onChange={(event) =>
              setAssignment((current) => ({
                ...current,
                payrollEmployeeReference: event.target.value || null,
              }))
            }
          />
          <span className="text-xs font-normal text-muted-foreground">
            Required when this staff member is included in a payroll export.
          </span>
        </label>
        {availableJobs.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {availableJobs.map((job) => {
              const isAssigned = assignment.jobIds.includes(job.id);

              return (
                <div
                  key={job.id}
                  className="rounded-lg border border-border bg-muted/35 p-4"
                >
                  <label className="flex items-start gap-3">
                    <Checkbox
                      checked={isAssigned}
                      disabled={!job.isActive && !isAssigned}
                      onCheckedChange={(checked) =>
                        toggleJob(job.id, checked === true)
                      }
                    />
                    <span className="min-w-0">
                      <span className="block font-medium">
                        {job.name}
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {job.permissions.length} permission
                        {job.permissions.length === 1 ? "" : "s"}
                        {!job.isActive ? " / Inactive" : ""}
                      </span>
                    </span>
                  </label>
                  {isAssigned ? (
                    <div className="mt-3 grid gap-3 border-t border-border pt-3">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name="primary-job"
                          checked={assignment.primaryJobId === job.id}
                          onChange={() =>
                            setAssignment((current) => ({
                              ...current,
                              primaryJobId: job.id,
                            }))
                          }
                        />
                        Primary permission baseline
                      </label>
                      <label className="grid gap-1.5 text-sm font-medium">
                        Hourly pay ({assignment.currency})
                        <input
                          type="number"
                          min="0"
                          max="10000"
                          step="0.01"
                          inputMode="decimal"
                          value={
                            assignment.payRates.find(
                              (rate) => rate.jobId === job.id,
                            )?.hourlyRateMinor == null
                              ? ""
                              : (
                                  (assignment.payRates.find(
                                    (rate) => rate.jobId === job.id,
                                  )?.hourlyRateMinor ?? 0) / 100
                                ).toFixed(2)
                          }
                          placeholder="Not set"
                          className="h-10 rounded-lg border border-input bg-background px-3 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                          onChange={(event) =>
                            setPayRate(job.id, event.target.value)
                          }
                        />
                      </label>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            Create a staff job before assigning one to this user.
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          The primary job supplies default permissions. Hourly pay is captured
          when a shift starts so later rate changes do not alter past records.
        </p>
        <div>
          <Button
            type="button"
            disabled={isSaving || !availableJobs.length}
            onClick={() => void save()}
          >
            <ButtonLabel icon={SaveIcon}>
              {isSaving ? "Saving..." : "Save jobs"}
            </ButtonLabel>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
