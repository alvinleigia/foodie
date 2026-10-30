import { CalendarDaysIcon, Clock3Icon } from "lucide-react";

import { StatusPill } from "@/components/shared/StatusPill";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { StaffScheduledShiftRecord } from "@/types/staff-schedule";

function formatDateTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(value));
}

export function StaffSchedulePanel({
  shifts,
  timezone,
}: {
  shifts: StaffScheduledShiftRecord[];
  timezone: string;
}) {
  return (
    <Card>
      <CardHeader className="px-5 pt-5">
        <div className="flex items-center gap-3">
          <CalendarDaysIcon className="size-5 text-muted-foreground" />
          <div>
            <h3 className="text-2xl font-semibold">My schedule</h3>
            <p className="text-sm text-muted-foreground">Times use {timezone}.</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        {shifts.length ? (
          <div className="divide-y divide-border border-y border-border">
            {shifts.map((shift) => (
              <div
                key={shift.id}
                className="grid gap-3 py-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center"
              >
                <div className="flex size-10 items-center justify-center rounded-lg border border-border bg-muted">
                  <Clock3Icon className="size-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{shift.jobName}</p>
                    <StatusPill tone="success">Scheduled</StatusPill>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {formatDateTime(shift.startsAt, timezone)} to{" "}
                    {formatDateTime(shift.endsAt, timezone)}
                  </p>
                  {shift.note ? (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {shift.note}
                    </p>
                  ) : null}
                </div>
                <p className="text-sm text-muted-foreground sm:text-right">
                  {shift.breakMinutes ? `${shift.breakMinutes}m break` : "No break"}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border p-5">
            <p className="font-medium">No upcoming shifts</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Published shifts assigned to you will appear here.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
