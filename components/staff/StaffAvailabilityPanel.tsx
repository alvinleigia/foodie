"use client";

import { useState } from "react";
import { CalendarRangeIcon, SaveIcon } from "lucide-react";
import { toast } from "sonner";

import { ButtonLabel } from "@/components/shared/ButtonLabel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { requestJson } from "@/lib/api-client";
import type {
  StaffAvailabilityDay,
  StaffWeeklyAvailability,
} from "@/types/staff-schedule";

const dayNames = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const displayOrder = [1, 2, 3, 4, 5, 6, 0];

function defaultDays(): StaffAvailabilityDay[] {
  return Array.from({ length: 7 }, (_, dayOfWeek) => ({
    dayOfWeek,
    isAvailable: dayOfWeek >= 1 && dayOfWeek <= 5,
    startsMinute: dayOfWeek >= 1 && dayOfWeek <= 5 ? 9 * 60 : null,
    endsMinute: dayOfWeek >= 1 && dayOfWeek <= 5 ? 17 * 60 : null,
  }));
}

function toTime(minutes: number | null) {
  if (minutes === null) return "";
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function toMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function StaffAvailabilityPanel({
  initialAvailability,
}: {
  initialAvailability: StaffWeeklyAvailability;
}) {
  const [availability, setAvailability] = useState(initialAvailability);
  const [days, setDays] = useState(
    initialAvailability.configured ? initialAvailability.days : defaultDays(),
  );
  const [isSaving, setIsSaving] = useState(false);

  function updateDay(
    dayOfWeek: number,
    update: (day: StaffAvailabilityDay) => StaffAvailabilityDay,
  ) {
    setDays((current) =>
      current.map((day) => (day.dayOfWeek === dayOfWeek ? update(day) : day)),
    );
  }

  async function saveAvailability() {
    setIsSaving(true);

    try {
      const result = await requestJson<StaffWeeklyAvailability>(
        "/api/tenant/availability",
        {
          method: "PUT",
          body: { days },
          fallbackError: "Weekly availability could not be saved.",
        },
      );
      setAvailability(result);
      setDays(result.days);
      toast.success("Weekly availability saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Save failed.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 px-5 pt-5">
        <div className="flex items-center gap-3">
          <CalendarRangeIcon className="size-5 text-muted-foreground" />
          <div>
            <h3 className="text-2xl font-semibold">Weekly availability</h3>
            <p className="text-sm text-muted-foreground">
              {availability.configured
                ? "Update the hours managers should schedule you within."
                : "Add your usual working days and hours."}
            </p>
          </div>
        </div>
        <Button type="button" disabled={isSaving} onClick={() => void saveAvailability()}>
          <ButtonLabel icon={SaveIcon}>
            {isSaving ? "Saving..." : "Save availability"}
          </ButtonLabel>
        </Button>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        <div className="divide-y divide-border border-y border-border">
          {displayOrder.map((dayOfWeek) => {
            const day = days.find((item) => item.dayOfWeek === dayOfWeek);
            if (!day) return null;

            return (
              <div
                key={dayOfWeek}
                className="grid gap-3 py-3 sm:grid-cols-[minmax(9rem,1fr)_minmax(0,2fr)] sm:items-center"
              >
                <label className="flex items-center gap-3 font-medium">
                  <Checkbox
                    checked={day.isAvailable}
                    onCheckedChange={(checked) =>
                      updateDay(dayOfWeek, (current) => ({
                        ...current,
                        isAvailable: checked === true,
                        startsMinute: checked === true ? (current.startsMinute ?? 540) : null,
                        endsMinute: checked === true ? (current.endsMinute ?? 1020) : null,
                      }))
                    }
                  />
                  {dayNames[dayOfWeek]}
                </label>
                {day.isAvailable ? (
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                    <Input
                      aria-label={`${dayNames[dayOfWeek]} start time`}
                      type="time"
                      value={toTime(day.startsMinute)}
                      onChange={(event) =>
                        updateDay(dayOfWeek, (current) => ({
                          ...current,
                          startsMinute: toMinutes(event.target.value),
                        }))
                      }
                    />
                    <span className="text-sm text-muted-foreground">to</span>
                    <Input
                      aria-label={`${dayNames[dayOfWeek]} end time`}
                      type="time"
                      value={toTime(day.endsMinute)}
                      onChange={(event) =>
                        updateDay(dayOfWeek, (current) => ({
                          ...current,
                          endsMinute: toMinutes(event.target.value),
                        }))
                      }
                    />
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Unavailable</p>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
