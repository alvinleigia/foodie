"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarClockIcon,
  CoffeeIcon,
  LogInIcon,
  LogOutIcon,
  PlayIcon,
  TimerIcon,
} from "lucide-react";
import { toast } from "sonner";

import { ButtonLabel } from "@/components/shared/ButtonLabel";
import { NativeSelect } from "@/components/shared/NativeSelect";
import { StatusPill } from "@/components/shared/StatusPill";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { requestJson } from "@/lib/api-client";
import type { StaffTimeClockSnapshot } from "@/types/staff-time-clock";

type TimeClockAction =
  | { action: "CLOCK_IN"; jobId: string; scheduledShiftId?: string }
  | { action: "START_BREAK" }
  | { action: "END_BREAK" }
  | { action: "CLOCK_OUT" };

function formatMinutes(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function StaffTimeClockPanel({
  initialSnapshot,
}: {
  initialSnapshot: StaffTimeClockSnapshot;
}) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [selectedJobId, setSelectedJobId] = useState(
    initialSnapshot.assignedJobs.find((job) => job.isPrimary)?.id ??
      initialSnapshot.assignedJobs[0]?.id ??
      "",
  );
  const [selectedScheduledShiftId, setSelectedScheduledShiftId] = useState<
    string | null
  >(null);
  const [isSaving, setIsSaving] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!snapshot.activeShift) {
      return;
    }

    const interval = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, [snapshot.activeShift]);

  const liveDurationMinutes = useMemo(() => {
    if (!snapshot.activeShift) {
      return 0;
    }

    return Math.max(
      0,
      Math.floor(
        (now - new Date(snapshot.activeShift.clockedInAt).getTime()) / 60_000,
      ),
    );
  }, [now, snapshot.activeShift]);

  async function submitAction(action: TimeClockAction) {
    setIsSaving(true);

    try {
      const result = await requestJson<StaffTimeClockSnapshot>(
        "/api/tenant/time-clock",
        { method: "POST", body: action },
      );
      setSnapshot(result);
      setNow(Date.now());
      toast.success(
        action.action === "CLOCK_IN"
          ? "Clocked in."
          : action.action === "CLOCK_OUT"
            ? "Clocked out."
            : action.action === "START_BREAK"
              ? "Break started."
              : "Break ended.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Time clock action failed.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  const activeShift = snapshot.activeShift;
  const isOnBreak = Boolean(activeShift?.breakStartedAt);

  return (
    <div className="grid gap-6">
      <Card className="rounded-xl border-stone-200 bg-white">
        <CardHeader className="px-5 pt-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-2xl font-semibold text-stone-950">
                {activeShift ? "Current shift" : "Start shift"}
              </h3>
              <p className="mt-1 text-sm text-stone-500">
                {activeShift
                  ? `${activeShift.jobName} / Clocked in ${formatDateTime(activeShift.clockedInAt)}`
                  : "Choose the job you are working, then clock in."}
              </p>
            </div>
            {activeShift ? (
              <StatusPill tone={isOnBreak ? "warning" : "success"}>
                {isOnBreak ? "On break" : "Clocked in"}
              </StatusPill>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="grid gap-5 px-5 pb-5">
          {activeShift ? (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-stone-200 bg-stone-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
                    Elapsed
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-stone-950">
                    {formatMinutes(liveDurationMinutes)}
                  </p>
                </div>
                <div className="rounded-lg border border-stone-200 bg-stone-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
                    Breaks
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-stone-950">
                    {formatMinutes(activeShift.breakMinutes)}
                  </p>
                </div>
                <div className="rounded-lg border border-stone-200 bg-stone-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
                    Job
                  </p>
                  <p className="mt-2 truncate text-lg font-semibold text-stone-950">
                    {activeShift.jobName}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                {isOnBreak ? (
                  <Button
                    type="button"
                    disabled={isSaving}
                    onClick={() => void submitAction({ action: "END_BREAK" })}
                  >
                    <ButtonLabel icon={PlayIcon}>End break</ButtonLabel>
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isSaving}
                    onClick={() => void submitAction({ action: "START_BREAK" })}
                  >
                    <ButtonLabel icon={CoffeeIcon}>Start break</ButtonLabel>
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  disabled={isSaving}
                  onClick={() => void submitAction({ action: "CLOCK_OUT" })}
                >
                  <ButtonLabel icon={LogOutIcon}>Clock out</ButtonLabel>
                </Button>
              </div>
            </>
          ) : snapshot.assignedJobs.length ? (
            <div className="grid max-w-xl gap-4">
              {snapshot.upcomingScheduledShifts.length ? (
                <div className="grid gap-2">
                  <p className="text-sm font-medium text-stone-800">
                    Upcoming schedule
                  </p>
                  {snapshot.upcomingScheduledShifts.map((shift) => (
                    <button
                      key={shift.id}
                      type="button"
                      className="flex items-center gap-3 rounded-lg border border-stone-200 bg-stone-50 p-3 text-left transition-colors hover:bg-stone-100"
                      onClick={() => {
                        setSelectedJobId(shift.jobId);
                        setSelectedScheduledShiftId(shift.id);
                      }}
                    >
                      <CalendarClockIcon className="size-5 text-stone-500" />
                      <span className="min-w-0">
                        <span className="block font-medium text-stone-900">
                          {shift.jobName}
                        </span>
                        <span className="mt-1 block text-xs text-stone-500">
                          {formatDateTime(shift.startsAt)} to{" "}
                          {formatDateTime(shift.endsAt)}
                        </span>
                      </span>
                      {selectedScheduledShiftId === shift.id ? (
                        <StatusPill className="ml-auto" tone="success">
                          Selected
                        </StatusPill>
                      ) : null}
                    </button>
                  ))}
                </div>
              ) : null}
              <label className="grid gap-2 text-sm font-medium text-stone-800">
                Job
                <NativeSelect
                  value={selectedJobId}
                  onChange={(event) => {
                    setSelectedJobId(event.target.value);
                    setSelectedScheduledShiftId(null);
                  }}
                >
                  {snapshot.assignedJobs.map((job) => (
                    <option key={job.id} value={job.id}>
                      {job.name}{job.isPrimary ? " (Primary)" : ""}
                    </option>
                  ))}
                </NativeSelect>
              </label>
              <div>
                <Button
                  type="button"
                  disabled={isSaving || !selectedJobId}
                  onClick={() =>
                    void submitAction({
                      action: "CLOCK_IN",
                      jobId: selectedJobId,
                      ...(selectedScheduledShiftId
                        ? { scheduledShiftId: selectedScheduledShiftId }
                        : {}),
                    })
                  }
                >
                  <ButtonLabel icon={LogInIcon}>Clock in</ButtonLabel>
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-stone-200 p-5">
              <p className="font-medium text-stone-900">No assigned job</p>
              <p className="mt-1 text-sm text-stone-500">
                A restaurant manager must assign an active job before you can
                clock in.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-xl border-stone-200 bg-white">
        <CardHeader className="px-5 pt-5">
          <div className="flex items-center gap-3">
            <TimerIcon className="size-5 text-stone-500" />
            <h3 className="text-xl font-semibold text-stone-950">
              Recent shifts
            </h3>
          </div>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          {snapshot.recentShifts.length ? (
            <div className="divide-y divide-stone-200 border-y border-stone-200">
              {snapshot.recentShifts.map((shift) => (
                <div
                  key={shift.id}
                  className="grid gap-2 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                >
                  <div>
                    <p className="font-medium text-stone-900">{shift.jobName}</p>
                    <p className="mt-1 text-sm text-stone-500">
                      {formatDateTime(shift.clockedInAt)} to {shift.clockedOutAt
                        ? formatDateTime(shift.clockedOutAt)
                        : "Open"}
                    </p>
                  </div>
                  <div className="text-sm text-stone-600 sm:text-right">
                    <p className="font-medium text-stone-900">
                      {formatMinutes(shift.workedMinutes)} worked
                    </p>
                    <p>{formatMinutes(shift.breakMinutes)} break</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-stone-200 p-4 text-sm text-stone-500">
              No completed shifts yet.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
