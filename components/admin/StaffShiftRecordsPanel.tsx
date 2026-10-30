"use client";

import { type FormEvent, useState } from "react";
import {
  CheckIcon,
  Clock3Icon,
  CoffeeIcon,
  DownloadIcon,
  FileSpreadsheetIcon,
  RotateCcwIcon,
  SearchIcon,
  UsersIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";

import { ButtonLabel } from "@/components/shared/ButtonLabel";
import { StatusPill } from "@/components/shared/StatusPill";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { NativeSelect } from "@/components/shared/NativeSelect";
import { fetchJson, requestJson } from "@/lib/api-client";
import type { StaffPayrollExportRun } from "@/types/staff-payroll";
import type { StaffShiftRecord } from "@/types/staff-time-clock";

type TimesheetFilters = {
  from: string;
  query: string;
  status: "" | "ACTIVE" | "APPROVED" | "PENDING";
  to: string;
};

const emptyFilters: TimesheetFilters = {
  from: "",
  query: "",
  status: "",
  to: "",
};

function buildFilterParams(
  filters: TimesheetFilters,
  options: { includeStatus?: boolean } = {},
) {
  const params = new URLSearchParams();

  if (filters.query.trim()) params.set("query", filters.query.trim());
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (options.includeStatus !== false && filters.status) {
    params.set("status", filters.status);
  }

  return params;
}

function formatMinutes(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatMoney(minor: number, currency: string) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
  }).format(minor / 100);
}

export function StaffShiftRecordsPanel({
  payrollRuns,
  shifts,
}: {
  payrollRuns: StaffPayrollExportRun[];
  shifts: StaffShiftRecord[];
}) {
  const [records, setRecords] = useState(shifts);
  const [exports, setExports] = useState(payrollRuns);
  const [draftFilters, setDraftFilters] = useState(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState(emptyFilters);
  const [selectedShiftIds, setSelectedShiftIds] = useState<Set<string>>(
    new Set(),
  );
  const [isFiltering, setIsFiltering] = useState(false);
  const [isBulkSaving, setIsBulkSaving] = useState(false);
  const [isPayrollExporting, setIsPayrollExporting] = useState(false);
  const [savingShiftId, setSavingShiftId] = useState<string | null>(null);
  const activeCount = records.filter((shift) => !shift.clockedOutAt).length;
  const onBreakCount = records.filter((shift) => shift.breakStartedAt).length;
  const approvedCount = records.filter(
    (shift) => shift.approvalStatus === "APPROVED",
  ).length;
  const selectedShifts = records.filter((shift) =>
    selectedShiftIds.has(shift.id),
  );
  const pendingShiftIds = records
    .filter(
      (shift) =>
        shift.clockedOutAt && shift.approvalStatus === "PENDING",
    )
    .map((shift) => shift.id);

  async function loadRecords(
    filters: TimesheetFilters,
    event?: FormEvent<HTMLFormElement>,
  ) {
    event?.preventDefault();
    setIsFiltering(true);

    try {
      const params = buildFilterParams(filters);
      const path = `/api/tenant/admin/staff-shifts${params.size ? `?${params}` : ""}`;
      const result = await fetchJson<{ shifts: StaffShiftRecord[] }>(path);
      setRecords(result.shifts);
      setAppliedFilters(filters);
      setSelectedShiftIds(new Set());
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Timesheets could not be loaded.",
      );
    } finally {
      setIsFiltering(false);
    }
  }

  function toggleShift(shiftId: string, checked: boolean) {
    setSelectedShiftIds((current) => {
      const next = new Set(current);
      if (checked) next.add(shiftId);
      else next.delete(shiftId);
      return next;
    });
  }

  async function updateBulkApproval(approved: boolean) {
    const shiftIds = [...selectedShiftIds];

    if (!shiftIds.length) return;
    setIsBulkSaving(true);

    try {
      const result = await requestJson<{ shifts: StaffShiftRecord[] }>(
        "/api/tenant/admin/staff-shifts/bulk",
        { method: "PATCH", body: { approved, shiftIds } },
      );
      const updatedById = new Map(
        result.shifts.map((shift) => [shift.id, shift]),
      );
      setRecords((current) =>
        current.map((shift) => updatedById.get(shift.id) ?? shift),
      );
      setSelectedShiftIds(new Set());
      toast.success(
        approved ? "Timesheets approved." : "Timesheets reopened.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "The selected timesheets could not be updated.",
      );
    } finally {
      setIsBulkSaving(false);
    }
  }

  function exportApproved() {
    const params = buildFilterParams(appliedFilters, {
      includeStatus: false,
    });
    window.location.assign(
      `/api/tenant/admin/staff-shifts/export${params.size ? `?${params}` : ""}`,
    );
  }

  async function exportPayroll() {
    if (!appliedFilters.from || !appliedFilters.to) {
      toast.error("Choose a from and to date before creating a payroll export.");
      return;
    }

    setIsPayrollExporting(true);

    try {
      const result = await requestJson<{ run: StaffPayrollExportRun }>(
        "/api/tenant/admin/staff-shifts/payroll-export",
        {
          method: "POST",
          body: {
            from: appliedFilters.from,
            query: appliedFilters.query.trim() || undefined,
            to: appliedFilters.to,
          },
        },
      );
      setExports((current) => [
        result.run,
        ...current.filter((item) => item.id !== result.run.id),
      ]);
      const link = document.createElement("a");
      link.href = `/api/tenant/admin/staff-shifts/payroll-export/${result.run.id}`;
      link.click();
      toast.success("Payroll export downloaded.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "The payroll export could not be generated.",
      );
    } finally {
      setIsPayrollExporting(false);
    }
  }

  async function updateApproval(shiftId: string, approved: boolean) {
    setSavingShiftId(shiftId);

    try {
      const result = await requestJson<{ shift: StaffShiftRecord }>(
        `/api/tenant/admin/staff-shifts/${shiftId}`,
        { method: "PATCH", body: { approved } },
      );
      setRecords((current) =>
        current.map((shift) =>
          shift.id === result.shift.id ? result.shift : shift,
        ),
      );
      toast.success(approved ? "Timesheet approved." : "Timesheet reopened.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "The timesheet could not be updated.",
      );
    } finally {
      setSavingShiftId(null);
    }
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-5 text-card-foreground">
          <UsersIcon className="size-5 text-muted-foreground" />
          <p className="mt-4 text-3xl font-semibold">
            {activeCount}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">Clocked in</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5 text-card-foreground">
          <CoffeeIcon className="size-5 text-muted-foreground" />
          <p className="mt-4 text-3xl font-semibold">
            {onBreakCount}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">On break</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5 text-card-foreground">
          <CheckIcon className="size-5 text-muted-foreground" />
          <p className="mt-4 text-3xl font-semibold">{approvedCount}</p>
          <p className="mt-1 text-sm text-muted-foreground">Approved</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5 text-card-foreground">
          <Clock3Icon className="size-5 text-muted-foreground" />
          <p className="mt-4 text-3xl font-semibold">
            {records.length}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">Recent records</p>
        </div>
      </div>

      <Card className="rounded-xl">
        <CardHeader className="px-5 pt-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-2xl font-semibold">Staff shift records</h3>
              <p className="text-sm text-muted-foreground">
                Review worked time and approve completed timesheets.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={exportApproved}
              >
                <ButtonLabel icon={DownloadIcon}>Timesheet CSV</ButtonLabel>
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={isPayrollExporting}
                onClick={() => void exportPayroll()}
              >
                <ButtonLabel icon={FileSpreadsheetIcon}>
                  {isPayrollExporting ? "Preparing..." : "Payroll CSV"}
                </ButtonLabel>
              </Button>
            </div>
          </div>
          <form
            className="mt-3 grid gap-2 lg:grid-cols-[minmax(14rem,1fr)_10rem_9.5rem_9.5rem_auto]"
            onSubmit={(event) => void loadRecords(draftFilters, event)}
          >
            <label className="relative">
              <span className="sr-only">Search staff or job</span>
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={draftFilters.query}
                placeholder="Search staff or job"
                className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                onChange={(event) =>
                  setDraftFilters((current) => ({
                    ...current,
                    query: event.target.value,
                  }))
                }
              />
            </label>
            <NativeSelect
              aria-label="Approval status"
              value={draftFilters.status}
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  status: event.target.value as TimesheetFilters["status"],
                }))
              }
            >
              <option value="">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="PENDING">Pending approval</option>
              <option value="APPROVED">Approved</option>
            </NativeSelect>
            <input
              type="date"
              aria-label="From date"
              value={draftFilters.from}
              className="h-9 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  from: event.target.value,
                }))
              }
            />
            <input
              type="date"
              aria-label="To date"
              value={draftFilters.to}
              className="h-9 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  to: event.target.value,
                }))
              }
            />
            <div className="flex gap-2">
              <Button type="submit" disabled={isFiltering}>
                <ButtonLabel icon={SearchIcon}>Apply</ButtonLabel>
              </Button>
              <Button
                type="button"
                variant="ghost"
                title="Clear filters"
                disabled={isFiltering}
                onClick={() => {
                  setDraftFilters(emptyFilters);
                  void loadRecords(emptyFilters);
                }}
              >
                <ButtonLabel icon={XIcon}>Clear</ButtonLabel>
              </Button>
            </div>
          </form>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          {records.length ? (
            <>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/35 px-3 py-2">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <Checkbox
                    aria-label="Select pending timesheets"
                    checked={
                      pendingShiftIds.length > 0 &&
                      pendingShiftIds.every((shiftId) =>
                        selectedShiftIds.has(shiftId),
                      )
                    }
                    onCheckedChange={(checked) =>
                      setSelectedShiftIds((current) => {
                        const next = new Set(current);
                        for (const shiftId of pendingShiftIds) {
                          if (checked === true) next.add(shiftId);
                          else next.delete(shiftId);
                        }
                        return next;
                      })
                    }
                  />
                  Select pending
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    {selectedShiftIds.size} selected
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={
                      isBulkSaving ||
                      !selectedShifts.some(
                        (shift) => shift.approvalStatus === "PENDING",
                      )
                    }
                    onClick={() => void updateBulkApproval(true)}
                  >
                    <ButtonLabel icon={CheckIcon}>Approve selected</ButtonLabel>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={
                      isBulkSaving ||
                      !selectedShifts.some(
                        (shift) => shift.approvalStatus === "APPROVED",
                      )
                    }
                    onClick={() => void updateBulkApproval(false)}
                  >
                    <ButtonLabel icon={RotateCcwIcon}>
                      Reopen selected
                    </ButtonLabel>
                  </Button>
                </div>
              </div>
              <div className="divide-y divide-border border-y border-border">
                {records.map((shift) => (
                <div
                  key={shift.id}
                  className="grid gap-3 py-4 lg:grid-cols-[auto_minmax(0,1fr)_minmax(12rem,auto)_auto_auto] lg:items-center"
                >
                  <Checkbox
                    aria-label={`Select ${shift.staffName} ${shift.jobName} timesheet`}
                    checked={selectedShiftIds.has(shift.id)}
                    disabled={!shift.clockedOutAt}
                    onCheckedChange={(checked) =>
                      toggleShift(shift.id, checked === true)
                    }
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{shift.staffName}</p>
                      {!shift.clockedOutAt ? (
                        <StatusPill
                          tone={shift.breakStartedAt ? "warning" : "success"}
                        >
                          {shift.breakStartedAt ? "On break" : "Clocked in"}
                        </StatusPill>
                      ) : shift.approvalStatus === "APPROVED" ? (
                        <StatusPill tone="success">Approved</StatusPill>
                      ) : (
                        <StatusPill tone="warning">Pending approval</StatusPill>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {shift.jobName}
                    </p>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    <p>{formatDateTime(shift.clockedInAt)}</p>
                    <p className="mt-1">
                      {shift.clockedOutAt
                        ? `Clocked out ${formatDateTime(shift.clockedOutAt)}`
                        : "Shift currently open"}
                    </p>
                  </div>
                  <div className="text-sm lg:text-right">
                    <p className="font-semibold">
                      {formatMinutes(shift.workedMinutes)} worked
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      {formatMinutes(shift.breakMinutes)} break
                    </p>
                    {shift.clockedOutAt &&
                    shift.grossPayMinor != null &&
                    shift.payCurrency ? (
                      <p className="mt-1 text-muted-foreground">
                        {formatMoney(
                          shift.grossPayMinor,
                          shift.payCurrency,
                        )} gross
                      </p>
                    ) : null}
                  </div>
                  <div>
                    {shift.clockedOutAt ? (
                      <Button
                        type="button"
                        variant="outline"
                        disabled={savingShiftId === shift.id}
                        onClick={() =>
                          void updateApproval(
                            shift.id,
                            shift.approvalStatus !== "APPROVED",
                          )
                        }
                      >
                        <ButtonLabel
                          icon={
                            shift.approvalStatus === "APPROVED"
                              ? RotateCcwIcon
                              : CheckIcon
                          }
                        >
                          {shift.approvalStatus === "APPROVED"
                            ? "Reopen"
                            : "Approve"}
                        </ButtonLabel>
                      </Button>
                    ) : null}
                  </div>
                </div>
                ))}
              </div>
            </>
          ) : (
            <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
              No staff shift records yet.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-xl">
        <CardHeader className="px-5 pt-5">
          <h3 className="text-2xl font-semibold">Payroll export history</h3>
          <p className="text-sm text-muted-foreground">
            Re-download immutable files without exporting the same shift twice.
          </p>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          {exports.length ? (
            <div className="divide-y divide-border border-y border-border">
              {exports.map((payrollExport) => (
                <div
                  key={payrollExport.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-4"
                >
                  <div>
                    <p className="font-semibold">
                      {payrollExport.periodFrom} to {payrollExport.periodTo}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {payrollExport.rowCount} shift
                      {payrollExport.rowCount === 1 ? "" : "s"} · {" "}
                      {formatMoney(
                        payrollExport.grossPayMinor,
                        payrollExport.currency,
                      )} gross · {payrollExport.generatedByName}
                    </p>
                  </div>
                  <Button asChild type="button" variant="outline">
                    <a
                      href={`/api/tenant/admin/staff-shifts/payroll-export/${payrollExport.id}`}
                    >
                      <ButtonLabel icon={DownloadIcon}>Download</ButtonLabel>
                    </a>
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
              No payroll exports yet.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
