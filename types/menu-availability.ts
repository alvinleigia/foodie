import type { WeeklyAvailabilityPeriod } from "@/lib/working-hours";

export type MenuAvailabilityCategoryRecord = {
  id: string;
  name: string;
  items: Array<{ id: string; name: string }>;
};

export type MenuAvailabilityScheduleRecord = {
  id: string;
  name: string;
  isEnabled: boolean;
  isAvailableNow: boolean;
  periods: WeeklyAvailabilityPeriod[];
  categoryIds: string[];
  itemIds: string[];
  updatedAt: string;
};

export type MenuAvailabilityConfiguration = {
  timezone: string;
  schedules: MenuAvailabilityScheduleRecord[];
  categories: MenuAvailabilityCategoryRecord[];
};

export type MenuAvailabilityState = {
  availableScheduleIds: Set<string>;
  categoryScheduleIds: Map<string, string[]>;
  itemScheduleIds: Map<string, string[]>;
};
