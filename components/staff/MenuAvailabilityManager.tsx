"use client";

import { useEffect, useState } from "react";
import {
  CalendarClockIcon,
  PencilLineIcon,
  PlusIcon,
  SaveIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";

import { ButtonLabel } from "@/components/shared/ButtonLabel";
import { EmptyState } from "@/components/shared/EmptyState";
import { FormField } from "@/components/shared/FormField";
import { TableSectionSkeleton } from "@/components/shared/SectionSkeletons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { fetchJson, requestJson } from "@/lib/api-client";
import {
  minuteOfDayToTime,
  restaurantWeekdays,
  timeToMinuteOfDay,
  type WeeklyAvailabilityPeriod,
} from "@/lib/working-hours";
import type {
  MenuAvailabilityConfiguration,
  MenuAvailabilityScheduleRecord,
} from "@/types/menu-availability";

type DraftPeriod = WeeklyAvailabilityPeriod & { key: string };

type ScheduleDraft = {
  id: string | null;
  name: string;
  isEnabled: boolean;
  periods: DraftPeriod[];
  categoryIds: string[];
  itemIds: string[];
};

const emptyDraft: ScheduleDraft = {
  id: null,
  name: "",
  isEnabled: true,
  periods: [],
  categoryIds: [],
  itemIds: [],
};

function toDraftPeriods(periods: WeeklyAvailabilityPeriod[]) {
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
    opensAtMinute >= 23 * 60
      ? 17 * 60
      : Math.min(opensAtMinute + 60, 23 * 60 + 59);
  return {
    closesAtMinute,
    dayOfWeek,
    is24Hours: false,
    key: `${dayOfWeek}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    opensAtMinute,
  };
}

function formatPeriodSummary(schedule: MenuAvailabilityScheduleRecord) {
  if (!schedule.periods.length) return "No active periods";
  const dayCount = new Set(schedule.periods.map((period) => period.dayOfWeek)).size;
  return `${schedule.periods.length} period${schedule.periods.length === 1 ? "" : "s"} across ${dayCount} day${dayCount === 1 ? "" : "s"}`;
}

export function MenuAvailabilityManager() {
  const [configuration, setConfiguration] =
    useState<MenuAvailabilityConfiguration | null>(null);
  const [draft, setDraft] = useState<ScheduleDraft>(emptyDraft);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        setConfiguration(
          await fetchJson<MenuAvailabilityConfiguration>(
            "/api/menu/availability",
            { fallbackError: "Failed to load menu availability." },
          ),
        );
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to load menu availability.",
        );
      } finally {
        setIsLoading(false);
      }
    }
    void load();
  }, []);

  function openSchedule(schedule?: MenuAvailabilityScheduleRecord) {
    setDraft(
      schedule
        ? {
            id: schedule.id,
            name: schedule.name,
            isEnabled: schedule.isEnabled,
            periods: toDraftPeriods(schedule.periods),
            categoryIds: schedule.categoryIds,
            itemIds: schedule.itemIds,
          }
        : emptyDraft,
    );
    setIsDialogOpen(true);
  }

  function updatePeriod(key: string, changes: Partial<WeeklyAvailabilityPeriod>) {
    setDraft((current) => ({
      ...current,
      periods: current.periods.map((period) =>
        period.key === key ? { ...period, ...changes } : period,
      ),
    }));
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
    setDraft((current) => ({
      ...current,
      periods: current.periods
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
    }));
  }

  function toggleAssignment(
    field: "categoryIds" | "itemIds",
    id: string,
    checked: boolean,
  ) {
    setDraft((current) => ({
      ...current,
      [field]: checked
        ? [...current[field], id]
        : current[field].filter((value) => value !== id),
    }));
  }

  async function save() {
    setIsSaving(true);
    try {
      const result = await requestJson<MenuAvailabilityConfiguration>(
        draft.id
          ? `/api/menu/availability/${draft.id}`
          : "/api/menu/availability",
        {
          method: draft.id ? "PUT" : "POST",
          body: {
            name: draft.name,
            isEnabled: draft.isEnabled,
            periods: draft.periods.map((period) => ({
              closesAtMinute: period.closesAtMinute,
              dayOfWeek: period.dayOfWeek,
              is24Hours: period.is24Hours,
              opensAtMinute: period.opensAtMinute,
            })),
            categoryIds: draft.categoryIds,
            itemIds: draft.itemIds,
          },
          fallbackError: "Failed to save menu availability schedule.",
        },
      );
      setConfiguration(result);
      setIsDialogOpen(false);
      toast.success(draft.id ? "Availability updated." : "Availability added.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to save menu availability schedule.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <Card className="mt-5">
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <CalendarClockIcon className="size-5 text-muted-foreground" />
              <h2 className="text-2xl font-semibold">Menu availability</h2>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Show categories and products only during named weekly schedules.
            </p>
          </div>
          <Button type="button" onClick={() => openSchedule()}>
            <ButtonLabel icon={PlusIcon}>Add schedule</ButtonLabel>
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <TableSectionSkeleton rows={3} />
          ) : configuration?.schedules.length ? (
            <div className="divide-y divide-border border-y border-border">
              {configuration.schedules.map((schedule) => (
                <div
                  key={schedule.id}
                  className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{schedule.name}</p>
                      <span
                        className={`rounded border px-2 py-0.5 text-xs font-medium ${
                          !schedule.isEnabled
                            ? "border-border bg-muted text-muted-foreground"
                            : schedule.isAvailableNow
                              ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
                              : "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
                        }`}
                      >
                        {!schedule.isEnabled
                          ? "Paused"
                          : schedule.isAvailableNow
                            ? "Available now"
                            : "Outside hours"}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {formatPeriodSummary(schedule)} · {schedule.categoryIds.length} categories · {schedule.itemIds.length} products
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => openSchedule(schedule)}
                  >
                    <ButtonLabel icon={PencilLineIcon}>Edit</ButtonLabel>
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No availability schedules"
              description="Your active categories and products are currently available whenever the restaurant accepts orders."
            />
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="p-0 sm:max-w-5xl">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>
              {draft.id ? "Edit availability schedule" : "Add availability schedule"}
            </DialogTitle>
            <DialogDescription>
              Times use {configuration?.timezone ?? "the restaurant timezone"}. Assigning a category restricts all products inside it.
            </DialogDescription>
          </DialogHeader>
          <div className="grid max-h-[72vh] gap-6 overflow-y-auto px-6 py-5">
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <FormField label="Schedule name" tone="themed">
                <Input
                  value={draft.name}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, name: event.target.value }))
                  }
                  placeholder="Breakfast"
                />
              </FormField>
              <label className="flex h-12 items-center gap-3 rounded-lg border border-border px-4">
                <Checkbox
                  checked={draft.isEnabled}
                  onCheckedChange={(checked) =>
                    setDraft((current) => ({
                      ...current,
                      isEnabled: checked === true,
                    }))
                  }
                />
                <span className="text-sm font-medium">Schedule enabled</span>
              </label>
            </div>

            <section>
              <h3 className="font-semibold">Weekly periods</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Overnight periods are supported. Empty schedules make assigned menu entries unavailable.
              </p>
              <div className="mt-3 divide-y divide-border border-y border-border">
                {restaurantWeekdays.map((weekday) => {
                  const dayPeriods = draft.periods.filter(
                    (period) => period.dayOfWeek === weekday.dayOfWeek,
                  );
                  const isOpen24Hours = dayPeriods.some(
                    (period) => period.is24Hours,
                  );
                  return (
                    <div
                      key={weekday.dayOfWeek}
                      className="grid gap-3 py-3 md:grid-cols-[7rem_minmax(0,1fr)_auto] md:items-start"
                    >
                      <p className="pt-2 text-sm font-semibold">{weekday.label}</p>
                      <div className="grid gap-2">
                        {dayPeriods.length ? (
                          dayPeriods.map((period) => (
                            <div key={period.key} className="flex flex-wrap items-center gap-2">
                              {period.is24Hours ? (
                                <p className="min-w-44 flex-1 py-2 text-sm font-medium">
                                  All day
                                </p>
                              ) : (
                                <div className="grid min-w-0 flex-1 grid-cols-[minmax(7rem,1fr)_auto_minmax(7rem,1fr)] items-center gap-2">
                                  <Input
                                    type="time"
                                    aria-label={`${weekday.label} availability start`}
                                    value={minuteOfDayToTime(period.opensAtMinute)}
                                    onChange={(event) => {
                                      const value = timeToMinuteOfDay(event.target.value);
                                      if (value !== null) {
                                        updatePeriod(period.key, { opensAtMinute: value });
                                      }
                                    }}
                                  />
                                  <span className="text-sm text-muted-foreground">to</span>
                                  <Input
                                    type="time"
                                    aria-label={`${weekday.label} availability end`}
                                    value={minuteOfDayToTime(period.closesAtMinute)}
                                    onChange={(event) => {
                                      const value = timeToMinuteOfDay(event.target.value);
                                      if (value !== null) {
                                        updatePeriod(period.key, { closesAtMinute: value });
                                      }
                                    }}
                                  />
                                </div>
                              )}
                              <label className="flex items-center gap-2 px-1 text-sm text-muted-foreground">
                                <Checkbox
                                  checked={period.is24Hours}
                                  onCheckedChange={(checked) =>
                                    setOpen24Hours(period, checked === true)
                                  }
                                />
                                All day
                              </label>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label={`Remove ${weekday.label} availability period`}
                                onClick={() =>
                                  setDraft((current) => ({
                                    ...current,
                                    periods: current.periods.filter(
                                      (candidate) => candidate.key !== period.key,
                                    ),
                                  }))
                                }
                              >
                                <Trash2Icon />
                              </Button>
                            </div>
                          ))
                        ) : (
                          <p className="py-2 text-sm text-muted-foreground">Unavailable</p>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isOpen24Hours}
                        onClick={() =>
                          setDraft((current) => ({
                            ...current,
                            periods: [
                              ...current.periods,
                              getNewPeriod(weekday.dayOfWeek, current.periods),
                            ],
                          }))
                        }
                      >
                        <ButtonLabel icon={PlusIcon}>Add</ButtonLabel>
                      </Button>
                    </div>
                  );
                })}
              </div>
            </section>

            <section>
              <h3 className="font-semibold">Menu assignments</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Category schedules apply to every product in that category. Product assignments add a product-specific restriction.
              </p>
              <div className="mt-3 divide-y divide-border border-y border-border">
                {configuration?.categories.map((category) => (
                  <div key={category.id} className="grid gap-3 py-4 md:grid-cols-[14rem_minmax(0,1fr)]">
                    <label className="flex items-start gap-3 font-medium">
                      <Checkbox
                        className="mt-0.5"
                        checked={draft.categoryIds.includes(category.id)}
                        onCheckedChange={(checked) =>
                          toggleAssignment("categoryIds", category.id, checked === true)
                        }
                      />
                      {category.name}
                    </label>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {category.items.map((item) => (
                        <label key={item.id} className="flex items-start gap-2 text-sm text-muted-foreground">
                          <Checkbox
                            className="mt-0.5"
                            checked={draft.itemIds.includes(item.id)}
                            onCheckedChange={(checked) =>
                              toggleAssignment("itemIds", item.id, checked === true)
                            }
                          />
                          {item.name}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void save()} disabled={isSaving}>
              <ButtonLabel icon={SaveIcon}>Save schedule</ButtonLabel>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
