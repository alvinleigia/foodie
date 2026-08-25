export const restaurantWeekdays = [
  { dayOfWeek: 1, label: "Monday", shortLabel: "Mon" },
  { dayOfWeek: 2, label: "Tuesday", shortLabel: "Tue" },
  { dayOfWeek: 3, label: "Wednesday", shortLabel: "Wed" },
  { dayOfWeek: 4, label: "Thursday", shortLabel: "Thu" },
  { dayOfWeek: 5, label: "Friday", shortLabel: "Fri" },
  { dayOfWeek: 6, label: "Saturday", shortLabel: "Sat" },
  { dayOfWeek: 0, label: "Sunday", shortLabel: "Sun" },
] as const;

export type RestaurantWorkingHoursPeriod = {
  closesAtMinute: number;
  dayOfWeek: number;
  is24Hours: boolean;
  opensAtMinute: number;
};

export type RestaurantWorkingHours = {
  enabled: boolean;
  periods: RestaurantWorkingHoursPeriod[];
  timezone: string;
};

const dayOfWeekByLabel: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function getZonedDayAndMinute(now: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    timeZone: timezone,
    weekday: "short",
  }).formatToParts(now);
  const weekday = parts.find((part) => part.type === "weekday")?.value;
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);

  if (
    !weekday ||
    dayOfWeekByLabel[weekday] === undefined ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute)
  ) {
    throw new Error("Restaurant working hours could not be evaluated.");
  }

  return {
    dayOfWeek: dayOfWeekByLabel[weekday],
    minuteOfDay: hour * 60 + minute,
  };
}

export function isRestaurantOpenForCustomerOrders(
  workingHours: RestaurantWorkingHours,
  now = new Date(),
) {
  if (!workingHours.enabled) {
    return true;
  }

  const { dayOfWeek, minuteOfDay } = getZonedDayAndMinute(
    now,
    workingHours.timezone,
  );
  const previousDayOfWeek = (dayOfWeek + 6) % 7;

  return workingHours.periods.some((period) => {
    if (period.dayOfWeek === dayOfWeek) {
      if (period.is24Hours) {
        return true;
      }

      if (period.closesAtMinute > period.opensAtMinute) {
        return (
          minuteOfDay >= period.opensAtMinute &&
          minuteOfDay < period.closesAtMinute
        );
      }

      return minuteOfDay >= period.opensAtMinute;
    }

    return (
      period.dayOfWeek === previousDayOfWeek &&
      !period.is24Hours &&
      period.closesAtMinute < period.opensAtMinute &&
      minuteOfDay < period.closesAtMinute
    );
  });
}

export function minuteOfDayToTime(value: number) {
  const hour = Math.floor(value / 60)
    .toString()
    .padStart(2, "0");
  const minute = (value % 60).toString().padStart(2, "0");

  return `${hour}:${minute}`;
}

export function timeToMinuteOfDay(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);

  if (!match) {
    return null;
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }

  return hour * 60 + minute;
}
