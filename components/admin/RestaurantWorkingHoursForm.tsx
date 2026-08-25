"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Clock3Icon, PlusIcon, SaveIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import { ButtonLabel } from "@/components/shared/ButtonLabel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { requestJson } from "@/lib/api-client";
import {
  minuteOfDayToTime,
  restaurantWeekdays,
  timeToMinuteOfDay,
  type RestaurantWorkingHours,
  type RestaurantWorkingHoursPeriod,
} from "@/lib/working-hours";

type DraftPeriod = RestaurantWorkingHoursPeriod & { key: string };

function toDraftPeriods(periods: RestaurantWorkingHoursPeriod[]) {
  return periods.map((period, index) => ({
    ...period,
    key: `${period.dayOfWeek}-${index}`,
  }));
}

function getNewPeriod(dayOfWeek: number, periods: DraftPeriod[]): DraftPeriod {
  const dayPeriods = periods.filter(
    (period) => period.dayOfWeek === dayOfWeek && !period.is24Hours,
  );
  const lastPeriod = dayPeriods.at(-1);
  const opensAtMinute = lastPeriod?.closesAtMinute ?? 9 * 60;
  const closesAtMinute =
    opensAtMinute >= 23 * 60 ? 17 * 60 : Math.min(opensAtMinute + 60, 23 * 60 + 59);

  return {
    closesAtMinute,
    dayOfWeek,
    is24Hours: false,
    key: `${dayOfWeek}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    opensAtMinute,
  };
}

export function RestaurantWorkingHoursForm({
  apiPath,
  initialValue,
}: {
  apiPath: string;
  initialValue: RestaurantWorkingHours;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialValue.enabled);
  const [periods, setPeriods] = useState<DraftPeriod[]>(() =>
    toDraftPeriods(initialValue.periods),
  );
  const [isSaving, setIsSaving] = useState(false);

  function updatePeriod(
    key: string,
    changes: Partial<RestaurantWorkingHoursPeriod>,
  ) {
    setPeriods((current) =>
      current.map((period) =>
        period.key === key ? { ...period, ...changes } : period,
      ),
    );
  }

  function setOpen24Hours(period: DraftPeriod, checked: boolean) {
    if (!checked) {
      updatePeriod(period.key, {
        closesAtMinute: 17 * 60,
        is24Hours: false,
        opensAtMinute: 9 * 60,
      });
      return;
    }

    setPeriods((current) =>
      current
        .filter(
          (candidate) =>
            candidate.dayOfWeek !== period.dayOfWeek ||
            candidate.key === period.key,
        )
        .map((candidate) =>
          candidate.key === period.key
            ? {
                ...candidate,
                closesAtMinute: 0,
                is24Hours: true,
                opensAtMinute: 0,
              }
            : candidate,
        ),
    );
  }

  async function save() {
    setIsSaving(true);

    try {
      await requestJson(apiPath, {
        body: {
          enabled,
          periods: periods.map((period) => ({
            closesAtMinute: period.closesAtMinute,
            dayOfWeek: period.dayOfWeek,
            is24Hours: period.is24Hours,
            opensAtMinute: period.opensAtMinute,
          })),
        },
        fallbackError: "Working hours could not be saved.",
        method: "PATCH",
      });
      toast.success("Customer ordering hours updated.");
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Working hours could not be saved.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card className="rounded-xl border-stone-200 bg-white">
      <CardHeader className="gap-4 px-5 pt-5 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Clock3Icon className="size-5 text-stone-500" />
            <h3 className="text-2xl font-semibold text-stone-950">
              Customer ordering hours
            </h3>
          </div>
          <p className="mt-2 text-sm text-stone-500">
            Set when customers can submit orders. Times use {initialValue.timezone}.
          </p>
        </div>
        <label className="flex max-w-sm items-start gap-3 rounded-lg border border-stone-200 bg-stone-50 p-3">
          <Checkbox
            checked={enabled}
            onCheckedChange={(checked) => setEnabled(checked === true)}
            aria-label="Enforce customer ordering hours"
            className="mt-0.5"
          />
          <span>
            <span className="block text-sm font-medium text-stone-900">
              Enforce working hours
            </span>
            <span className="mt-1 block text-xs leading-5 text-stone-500">
              Staff can still take orders after closing.
            </span>
          </span>
        </label>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        {enabled && periods.length === 0 ? (
          <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Every day is closed. Customer ordering will remain closed until an
            opening period is added.
          </p>
        ) : null}

        <TooltipProvider>
          <div className="divide-y divide-stone-200 border-y border-stone-200">
            {restaurantWeekdays.map((weekday) => {
              const dayPeriods = periods.filter(
                (period) => period.dayOfWeek === weekday.dayOfWeek,
              );
              const isOpen24Hours = dayPeriods.some((period) => period.is24Hours);

              return (
                <div
                  key={weekday.dayOfWeek}
                  className="grid gap-3 py-4 md:grid-cols-[8rem_minmax(0,1fr)_2rem] md:items-start"
                >
                  <p className="pt-2 text-sm font-semibold text-stone-900">
                    {weekday.label}
                  </p>
                  <div className="grid gap-3">
                    {dayPeriods.length === 0 ? (
                      <p className="py-2 text-sm text-stone-500">Closed</p>
                    ) : (
                      dayPeriods.map((period) => (
                        <div
                          key={period.key}
                          className="flex min-w-0 flex-wrap items-center gap-2"
                        >
                          {period.is24Hours ? (
                            <p className="min-w-44 flex-1 py-2 text-sm font-medium text-stone-800">
                              Open 24 hours
                            </p>
                          ) : (
                            <div className="grid min-w-0 flex-1 grid-cols-[minmax(7.5rem,1fr)_auto_minmax(7.5rem,1fr)] items-center gap-2">
                              <Input
                                type="time"
                                value={minuteOfDayToTime(period.opensAtMinute)}
                                aria-label={`${weekday.label} opening time`}
                                onChange={(event) => {
                                  const value = timeToMinuteOfDay(event.target.value);
                                  if (value !== null) {
                                    updatePeriod(period.key, { opensAtMinute: value });
                                  }
                                }}
                              />
                              <span className="text-sm text-stone-500">to</span>
                              <Input
                                type="time"
                                value={minuteOfDayToTime(period.closesAtMinute)}
                                aria-label={`${weekday.label} closing time`}
                                onChange={(event) => {
                                  const value = timeToMinuteOfDay(event.target.value);
                                  if (value !== null) {
                                    updatePeriod(period.key, { closesAtMinute: value });
                                  }
                                }}
                              />
                            </div>
                          )}
                          <label className="flex items-center gap-2 px-1 text-sm text-stone-600">
                            <Checkbox
                              checked={period.is24Hours}
                              onCheckedChange={(checked) =>
                                setOpen24Hours(period, checked === true)
                              }
                              aria-label={`${weekday.label} open 24 hours`}
                            />
                            24 hours
                          </label>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label={`Remove ${weekday.label} opening period`}
                                onClick={() =>
                                  setPeriods((current) =>
                                    current.filter(
                                      (candidate) => candidate.key !== period.key,
                                    ),
                                  )
                                }
                              >
                                <Trash2Icon />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Remove opening period</TooltipContent>
                          </Tooltip>
                        </div>
                      ))
                    )}
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        disabled={isOpen24Hours}
                        aria-label={`Add ${weekday.label} opening period`}
                        onClick={() =>
                          setPeriods((current) => [
                            ...current,
                            getNewPeriod(weekday.dayOfWeek, current),
                          ])
                        }
                      >
                        <PlusIcon />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Add opening period</TooltipContent>
                  </Tooltip>
                </div>
              );
            })}
          </div>
        </TooltipProvider>

        <div className="mt-5 flex justify-end">
          <Button
            type="button"
            disabled={isSaving}
            onClick={() => void save()}
            className="bg-stone-950 text-white hover:bg-stone-800"
          >
            <ButtonLabel icon={SaveIcon}>
              {isSaving ? "Saving..." : "Save working hours"}
            </ButtonLabel>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
