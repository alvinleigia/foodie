import { z } from "zod";

const minutesPerDay = 1440;
const minutesPerWeek = 7 * minutesPerDay;

const workingHoursPeriodSchema = z
  .object({
    closesAtMinute: z.number().int().min(0).max(minutesPerDay - 1),
    dayOfWeek: z.number().int().min(0).max(6),
    is24Hours: z.boolean(),
    opensAtMinute: z.number().int().min(0).max(minutesPerDay - 1),
  })
  .transform((period) =>
    period.is24Hours
      ? { ...period, closesAtMinute: 0, opensAtMinute: 0 }
      : period,
  );

type WeeklyInterval = {
  end: number;
  periodIndex: number;
  start: number;
};

function getWeeklyIntervals(
  periods: z.infer<typeof workingHoursPeriodSchema>[],
) {
  const intervals: WeeklyInterval[] = [];

  periods.forEach((period, periodIndex) => {
    const dayStart = period.dayOfWeek * minutesPerDay;
    const start = dayStart + period.opensAtMinute;
    const end = period.is24Hours
      ? dayStart + minutesPerDay
      : period.closesAtMinute > period.opensAtMinute
        ? dayStart + period.closesAtMinute
        : dayStart + minutesPerDay + period.closesAtMinute;

    if (end <= minutesPerWeek) {
      intervals.push({ end, periodIndex, start });
      return;
    }

    intervals.push({ end: minutesPerWeek, periodIndex, start });
    intervals.push({ end: end - minutesPerWeek, periodIndex, start: 0 });
  });

  return intervals;
}

export const restaurantWorkingHoursInputSchema = z
  .object({
    enabled: z.boolean(),
    periods: z.array(workingHoursPeriodSchema).max(35),
  })
  .superRefine((value, context) => {
    value.periods.forEach((period, periodIndex) => {
      if (
        !period.is24Hours &&
        period.opensAtMinute === period.closesAtMinute
      ) {
        context.addIssue({
          code: "custom",
          message: "Opening and closing times must be different.",
          path: ["periods", periodIndex],
        });
      }
    });

    const intervals = getWeeklyIntervals(value.periods);

    for (let leftIndex = 0; leftIndex < intervals.length; leftIndex += 1) {
      for (
        let rightIndex = leftIndex + 1;
        rightIndex < intervals.length;
        rightIndex += 1
      ) {
        const left = intervals[leftIndex];
        const right = intervals[rightIndex];

        if (
          left.periodIndex !== right.periodIndex &&
          left.start < right.end &&
          right.start < left.end
        ) {
          context.addIssue({
            code: "custom",
            message: "Working-hour periods cannot overlap.",
            path: ["periods", right.periodIndex],
          });
          return;
        }
      }
    }
  });
