"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarClockIcon,
  PencilLineIcon,
  PlusIcon,
  SaveIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";

import { ButtonLabel } from "@/components/shared/ButtonLabel";
import { FormField } from "@/components/shared/FormField";
import { NativeSelect } from "@/components/shared/NativeSelect";
import { StatusPill } from "@/components/shared/StatusPill";
import { useFormValidation } from "@/components/shared/useFormValidation";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { requestJson } from "@/lib/api-client";
import type {
  StaffScheduleConfiguration,
  StaffScheduledShiftRecord,
} from "@/types/staff-schedule";

type ScheduleDraft = {
  id: string | null;
  membershipId: string;
  jobId: string;
  startsAt: string;
  endsAt: string;
  breakMinutes: string;
  note: string;
  availabilityOverrideReason: string;
};

type ScheduleField =
  | "membershipId"
  | "jobId"
  | "startsAt"
  | "endsAt"
  | "breakMinutes"
  | "note"
  | "availabilityOverrideReason";

const availabilityDayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatMinutes(minutes: number | null) {
  if (minutes === null) return "";
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function formatAvailability(
  availability: StaffScheduleConfiguration["members"][number]["availability"],
) {
  if (!availability.configured) return "No availability pattern set";
  const availableDays = availability.days.filter((day) => day.isAvailable);
  if (!availableDays.length) return "Unavailable all week";
  return availableDays
    .map(
      (day) =>
        `${availabilityDayNames[day.dayOfWeek]} ${formatMinutes(day.startsMinute)}-${formatMinutes(day.endsMinute)}`,
    )
    .join(", ");
}

function formatForInput(value: Date | string, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: timezone,
  }).formatToParts(new Date(value));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}

function formatDateTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(value));
}

function createDraft(
  configuration: StaffScheduleConfiguration,
  shift?: StaffScheduledShiftRecord,
): ScheduleDraft {
  if (shift) {
    return {
      id: shift.id,
      membershipId: shift.membershipId ?? "",
      jobId: shift.jobId,
      startsAt: formatForInput(shift.startsAt, configuration.timezone),
      endsAt: formatForInput(shift.endsAt, configuration.timezone),
      breakMinutes: String(shift.breakMinutes),
      note: shift.note ?? "",
      availabilityOverrideReason: shift.availabilityOverrideReason ?? "",
    };
  }

  const member = configuration.members.find((item) => item.jobs.length);
  const startsAt = new Date(Date.now() + 60 * 60_000);
  startsAt.setUTCMinutes(startsAt.getUTCMinutes() < 30 ? 30 : 60, 0, 0);
  const endsAt = new Date(startsAt.getTime() + 8 * 60 * 60_000);

  return {
    id: null,
    membershipId: member?.membershipId ?? "",
    jobId:
      member?.jobs.find((job) => job.isPrimary)?.id ??
      member?.jobs[0]?.id ??
      configuration.jobs[0]?.id ??
      "",
    startsAt: formatForInput(startsAt, configuration.timezone),
    endsAt: formatForInput(endsAt, configuration.timezone),
    breakMinutes: "0",
    note: "",
    availabilityOverrideReason: "",
  };
}

export function StaffScheduleManager({
  initialConfiguration,
}: {
  initialConfiguration: StaffScheduleConfiguration;
}) {
  const router = useRouter();
  const [configuration, setConfiguration] = useState(initialConfiguration);
  const [draft, setDraft] = useState<ScheduleDraft>(() =>
    createDraft(initialConfiguration),
  );
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [cancelShift, setCancelShift] = useState<StaffScheduledShiftRecord | null>(
    null,
  );
  const validation = useFormValidation<ScheduleField>();
  const selectedMember = configuration.members.find(
    (member) => member.membershipId === draft.membershipId,
  );
  const activeShifts = useMemo(
    () => configuration.shifts.filter((shift) => shift.status === "PUBLISHED"),
    [configuration.shifts],
  );

  function openCreateDialog() {
    setDraft(createDraft(configuration));
    validation.clearErrors();
    setIsDialogOpen(true);
  }

  function openEditDialog(shift: StaffScheduledShiftRecord) {
    setDraft(createDraft(configuration, shift));
    validation.clearErrors();
    setIsDialogOpen(true);
  }

  function updateField<Field extends ScheduleField>(
    field: Field,
    value: ScheduleDraft[Field],
  ) {
    validation.clearFieldError(field);
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function selectMember(membershipId: string) {
    const member = configuration.members.find(
      (item) => item.membershipId === membershipId,
    );
    const jobId =
      member?.jobs.find((job) => job.isPrimary)?.id ??
      member?.jobs[0]?.id ??
      configuration.jobs[0]?.id ??
      "";

    validation.clearFieldError("membershipId");
    validation.clearFieldError("jobId");
    setDraft((current) => ({ ...current, membershipId, jobId }));
  }

  async function saveShift() {
    setIsSaving(true);
    validation.clearErrors();

    try {
      const result = await requestJson<StaffScheduleConfiguration>(
        draft.id
          ? `/api/tenant/admin/staff-schedule/${draft.id}`
          : "/api/tenant/admin/staff-schedule",
        {
          method: draft.id ? "PATCH" : "POST",
          body: {
            membershipId: draft.membershipId || null,
            jobId: draft.jobId,
            startsAt: draft.startsAt,
            endsAt: draft.endsAt,
            breakMinutes: draft.breakMinutes,
            note: draft.note,
            availabilityOverrideReason: draft.availabilityOverrideReason,
          },
        },
      );
      setConfiguration(result);
      setIsDialogOpen(false);
      router.refresh();
      toast.success(draft.id ? "Scheduled shift updated." : "Shift scheduled.");
    } catch (caught) {
      const result = validation.applyCaught(caught);

      if (!result.hasFieldErrors) {
        toast.error(result.message);
      }
    } finally {
      setIsSaving(false);
    }
  }

  async function cancelScheduledShift() {
    if (!cancelShift) {
      return;
    }

    setIsSaving(true);

    try {
      const result = await requestJson<StaffScheduleConfiguration>(
        `/api/tenant/admin/staff-schedule/${cancelShift.id}`,
        { method: "PATCH", body: { status: "CANCELLED" } },
      );
      setConfiguration(result);
      setCancelShift(null);
      router.refresh();
      toast.success("Scheduled shift cancelled.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Cancellation failed.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <div className="grid gap-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border bg-card p-5 text-card-foreground">
            <p className="text-3xl font-semibold">{activeShifts.length}</p>
            <p className="mt-1 text-sm text-muted-foreground">Scheduled shifts</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-5 text-card-foreground">
            <p className="text-3xl font-semibold">
              {
                new Set(
                  activeShifts
                    .map((shift) => shift.membershipId)
                    .filter((membershipId) => membershipId !== null),
                ).size
              }
            </p>
            <p className="mt-1 text-sm text-muted-foreground">Staff scheduled</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-5 text-card-foreground">
            <p className="truncate text-lg font-semibold">
              {configuration.timezone}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">Schedule timezone</p>
          </div>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4 px-5 pt-5">
            <div>
              <h3 className="text-2xl font-semibold">Staff schedule</h3>
              <p className="text-sm text-muted-foreground">
                Plan upcoming work using each staff member&apos;s assigned jobs.
              </p>
            </div>
            <Button
              type="button"
              onClick={openCreateDialog}
              disabled={!configuration.jobs.length}
            >
              <ButtonLabel icon={PlusIcon}>Add shift</ButtonLabel>
            </Button>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            {configuration.shifts.length ? (
              <div className="divide-y divide-border border-y border-border">
                {configuration.shifts.map((shift) => (
                  <div
                    key={shift.id}
                    className="grid gap-3 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(15rem,auto)_auto] lg:items-center"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">
                          {shift.staffName ?? "Open shift"}
                        </p>
                        <StatusPill
                          tone={shift.status === "CANCELLED" ? "neutral" : "success"}
                        >
                          {shift.status === "CANCELLED" ? "Cancelled" : "Scheduled"}
                        </StatusPill>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {shift.jobName}
                        {shift.breakMinutes ? ` / ${shift.breakMinutes}m break` : ""}
                      </p>
                      {shift.note ? (
                        <p className="mt-1 text-sm text-muted-foreground">
                          {shift.note}
                        </p>
                      ) : null}
                      {shift.availabilityOverrideReason ? (
                        <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
                          Availability override: {shift.availabilityOverrideReason}
                        </p>
                      ) : null}
                    </div>
                    <div className="text-sm">
                      <p>{formatDateTime(shift.startsAt, configuration.timezone)}</p>
                      <p className="mt-1 text-muted-foreground">
                        to {formatDateTime(shift.endsAt, configuration.timezone)}
                      </p>
                    </div>
                    {shift.status === "PUBLISHED" ? (
                      <div className="flex flex-wrap gap-2 lg:justify-end">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => openEditDialog(shift)}
                        >
                          <ButtonLabel icon={PencilLineIcon}>Edit</ButtonLabel>
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setCancelShift(shift)}
                        >
                          <ButtonLabel icon={XIcon}>Cancel</ButtonLabel>
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border p-5">
                <p className="font-medium">No scheduled shifts</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Add the first shift after assigning jobs to restaurant staff.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-3xl p-0">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle className="text-2xl">
              {draft.id ? "Edit scheduled shift" : "Add scheduled shift"}
            </DialogTitle>
            <DialogDescription>
              Times use {configuration.timezone}.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 px-6 pb-5 sm:grid-cols-2">
            <FormField
              label="Staff member"
              error={validation.getError("membershipId")}
            >
              <NativeSelect
                value={draft.membershipId}
                onChange={(event) => selectMember(event.target.value)}
              >
                <option value="">Open shift (unassigned)</option>
                {configuration.members.map((member) => (
                  <option
                    key={member.membershipId}
                    value={member.membershipId}
                    disabled={!member.jobs.length}
                  >
                    {member.staffName}{member.jobs.length ? "" : " (No jobs)"}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label="Job" error={validation.getError("jobId")}>
              <NativeSelect
                value={draft.jobId}
                onChange={(event) => updateField("jobId", event.target.value)}
              >
                <option value="">Choose job</option>
                {(selectedMember?.jobs ?? configuration.jobs).map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.name}
                    {"isPrimary" in job && job.isPrimary ? " (Primary)" : ""}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm sm:col-span-2">
              <span className="font-medium">Declared availability: </span>
              <span className="text-muted-foreground">
                {selectedMember
                  ? formatAvailability(selectedMember.availability)
                  : "Open shifts can be offered to qualified staff"}
              </span>
            </div>
            <FormField label="Starts" error={validation.getError("startsAt")}>
              <Input
                type="datetime-local"
                value={draft.startsAt}
                onChange={(event) => updateField("startsAt", event.target.value)}
              />
            </FormField>
            <FormField label="Ends" error={validation.getError("endsAt")}>
              <Input
                type="datetime-local"
                value={draft.endsAt}
                onChange={(event) => updateField("endsAt", event.target.value)}
              />
            </FormField>
            <FormField
              label="Unpaid break (minutes)"
              error={validation.getError("breakMinutes")}
            >
              <Input
                type="number"
                min="0"
                max="480"
                value={draft.breakMinutes}
                onChange={(event) =>
                  updateField("breakMinutes", event.target.value)
                }
              />
            </FormField>
            <FormField
              label="Note (optional)"
              error={validation.getError("note")}
              className="sm:col-span-2"
            >
              <Textarea
                value={draft.note}
                maxLength={500}
                rows={3}
                onChange={(event) => updateField("note", event.target.value)}
                placeholder="Handover or shift instructions"
              />
            </FormField>
            <FormField
              label="Availability override reason (if outside declared hours)"
              error={validation.getError("availabilityOverrideReason")}
              className="sm:col-span-2"
            >
              <Textarea
                value={draft.availabilityOverrideReason}
                maxLength={500}
                rows={2}
                onChange={(event) =>
                  updateField("availabilityOverrideReason", event.target.value)
                }
                placeholder="For example, employee agreed to cover this shift"
              />
            </FormField>
            {validation.formError ? (
              <p className="text-sm text-destructive sm:col-span-2">
                {validation.formError}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsDialogOpen(false)}
            >
              <ButtonLabel icon={XIcon}>Close</ButtonLabel>
            </Button>
            <Button type="button" disabled={isSaving} onClick={() => void saveShift()}>
              <ButtonLabel icon={SaveIcon}>
                {isSaving ? "Saving..." : "Save shift"}
              </ButtonLabel>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(cancelShift)}
        onOpenChange={(open) => !open && setCancelShift(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel scheduled shift?</AlertDialogTitle>
            <AlertDialogDescription>
              The shift remains in schedule history and can no longer be edited.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep shift</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isSaving}
              onClick={() => void cancelScheduledShift()}
            >
              <CalendarClockIcon />
              Cancel shift
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
