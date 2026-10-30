import "server-only";

import { and, asc, eq, inArray } from "drizzle-orm";

import { getDb } from "@/db";
import {
  menuAvailabilityPeriods,
  menuAvailabilitySchedules,
  menuCategories,
  menuCategoryAvailabilitySchedules,
  menuItemAvailabilitySchedules,
  menuItems,
  organizations,
} from "@/db/schema";
import { hasPostgresErrorCode } from "@/lib/postgres-errors";
import type { TenantContext } from "@/lib/tenant-context";
import { menuAvailabilityScheduleSchema } from "@/lib/validations/menu-availability";
import { isWeeklyScheduleAvailable } from "@/lib/working-hours";
import type {
  MenuAvailabilityConfiguration,
  MenuAvailabilityState,
} from "@/types/menu-availability";

export class MenuAvailabilityConflictError extends Error {}

export class MenuAvailabilityNotFoundError extends Error {}

async function loadAvailabilityRows(context: TenantContext) {
  const db = getDb();
  const [organizationRows, scheduleRows, periodRows, categoryAssignmentRows, itemAssignmentRows] =
    await Promise.all([
      db
        .select({ timezone: organizations.timezone })
        .from(organizations)
        .where(
          and(
            eq(organizations.id, context.organizationId),
            eq(organizations.type, "RESTAURANT"),
          ),
        )
        .limit(1),
      db
        .select()
        .from(menuAvailabilitySchedules)
        .where(
          eq(menuAvailabilitySchedules.organizationId, context.organizationId),
        )
        .orderBy(asc(menuAvailabilitySchedules.name)),
      db
        .select()
        .from(menuAvailabilityPeriods)
        .where(
          eq(menuAvailabilityPeriods.organizationId, context.organizationId),
        )
        .orderBy(
          asc(menuAvailabilityPeriods.dayOfWeek),
          asc(menuAvailabilityPeriods.sortOrder),
        ),
      db
        .select({
          categoryId: menuCategoryAvailabilitySchedules.categoryId,
          scheduleId: menuCategoryAvailabilitySchedules.scheduleId,
        })
        .from(menuCategoryAvailabilitySchedules)
        .where(
          eq(
            menuCategoryAvailabilitySchedules.organizationId,
            context.organizationId,
          ),
        ),
      db
        .select({
          itemId: menuItemAvailabilitySchedules.menuItemId,
          scheduleId: menuItemAvailabilitySchedules.scheduleId,
        })
        .from(menuItemAvailabilitySchedules)
        .where(
          eq(
            menuItemAvailabilitySchedules.organizationId,
            context.organizationId,
          ),
        ),
    ]);
  const organization = organizationRows[0];
  if (!organization) {
    throw new MenuAvailabilityNotFoundError("Restaurant not found.");
  }
  return {
    timezone: organization.timezone,
    scheduleRows,
    periodRows,
    categoryAssignmentRows,
    itemAssignmentRows,
  };
}

export async function getMenuAvailabilityState(
  context: TenantContext,
  now = new Date(),
): Promise<MenuAvailabilityState> {
  const rows = await loadAvailabilityRows(context);
  const periodsBySchedule = new Map<
    string,
    Array<{
      closesAtMinute: number;
      dayOfWeek: number;
      is24Hours: boolean;
      opensAtMinute: number;
    }>
  >();
  for (const period of rows.periodRows) {
    const periods = periodsBySchedule.get(period.scheduleId) ?? [];
    periods.push({
      closesAtMinute: period.closesAtMinute,
      dayOfWeek: period.dayOfWeek,
      is24Hours: period.is24Hours,
      opensAtMinute: period.opensAtMinute,
    });
    periodsBySchedule.set(period.scheduleId, periods);
  }
  const availableScheduleIds = new Set(
    rows.scheduleRows
      .filter(
        (schedule) =>
          schedule.isEnabled &&
          isWeeklyScheduleAvailable(
            periodsBySchedule.get(schedule.id) ?? [],
            rows.timezone,
            now,
          ),
      )
      .map((schedule) => schedule.id),
  );
  const categoryScheduleIds = new Map<string, string[]>();
  for (const assignment of rows.categoryAssignmentRows) {
    const scheduleIds = categoryScheduleIds.get(assignment.categoryId) ?? [];
    scheduleIds.push(assignment.scheduleId);
    categoryScheduleIds.set(assignment.categoryId, scheduleIds);
  }
  const itemScheduleIds = new Map<string, string[]>();
  for (const assignment of rows.itemAssignmentRows) {
    const scheduleIds = itemScheduleIds.get(assignment.itemId) ?? [];
    scheduleIds.push(assignment.scheduleId);
    itemScheduleIds.set(assignment.itemId, scheduleIds);
  }
  return { availableScheduleIds, categoryScheduleIds, itemScheduleIds };
}

function isAssignedEntityAvailable(
  scheduleIds: string[] | undefined,
  availableScheduleIds: Set<string>,
) {
  return !scheduleIds?.length || scheduleIds.some((id) => availableScheduleIds.has(id));
}

export function isMenuCategoryAvailable(
  categoryId: string,
  state: MenuAvailabilityState,
) {
  return isAssignedEntityAvailable(
    state.categoryScheduleIds.get(categoryId),
    state.availableScheduleIds,
  );
}

export function isMenuItemAvailable(
  categoryId: string,
  itemId: string,
  state: MenuAvailabilityState,
) {
  return (
    isMenuCategoryAvailable(categoryId, state) &&
    isAssignedEntityAvailable(
      state.itemScheduleIds.get(itemId),
      state.availableScheduleIds,
    )
  );
}

export async function getMenuAvailabilityConfiguration(
  context: TenantContext,
): Promise<MenuAvailabilityConfiguration> {
  const db = getDb();
  const [rows, categoryRows, itemRows] = await Promise.all([
    loadAvailabilityRows(context),
    db
      .select({ id: menuCategories.id, name: menuCategories.name })
      .from(menuCategories)
      .where(eq(menuCategories.organizationId, context.organizationId))
      .orderBy(asc(menuCategories.sortOrder), asc(menuCategories.name)),
    db
      .select({
        id: menuItems.id,
        categoryId: menuItems.categoryId,
        name: menuItems.name,
      })
      .from(menuItems)
      .where(eq(menuItems.organizationId, context.organizationId))
      .orderBy(asc(menuItems.sortOrder), asc(menuItems.name)),
  ]);
  const periodsBySchedule = new Map<
    string,
    MenuAvailabilityConfiguration["schedules"][number]["periods"]
  >();
  for (const period of rows.periodRows) {
    const periods = periodsBySchedule.get(period.scheduleId) ?? [];
    periods.push({
      closesAtMinute: period.closesAtMinute,
      dayOfWeek: period.dayOfWeek,
      is24Hours: period.is24Hours,
      opensAtMinute: period.opensAtMinute,
    });
    periodsBySchedule.set(period.scheduleId, periods);
  }
  const categoryIdsBySchedule = new Map<string, string[]>();
  for (const assignment of rows.categoryAssignmentRows) {
    const categoryIds = categoryIdsBySchedule.get(assignment.scheduleId) ?? [];
    categoryIds.push(assignment.categoryId);
    categoryIdsBySchedule.set(assignment.scheduleId, categoryIds);
  }
  const itemIdsBySchedule = new Map<string, string[]>();
  for (const assignment of rows.itemAssignmentRows) {
    const itemIds = itemIdsBySchedule.get(assignment.scheduleId) ?? [];
    itemIds.push(assignment.itemId);
    itemIdsBySchedule.set(assignment.scheduleId, itemIds);
  }

  return {
    timezone: rows.timezone,
    schedules: rows.scheduleRows.map((schedule) => ({
      id: schedule.id,
      name: schedule.name,
      isEnabled: schedule.isEnabled,
      isAvailableNow:
        schedule.isEnabled &&
        isWeeklyScheduleAvailable(
          periodsBySchedule.get(schedule.id) ?? [],
          rows.timezone,
        ),
      periods: periodsBySchedule.get(schedule.id) ?? [],
      categoryIds: categoryIdsBySchedule.get(schedule.id) ?? [],
      itemIds: itemIdsBySchedule.get(schedule.id) ?? [],
      updatedAt: schedule.updatedAt.toISOString(),
    })),
    categories: categoryRows.map((category) => ({
      ...category,
      items: itemRows
        .filter((item) => item.categoryId === category.id)
        .map((item) => ({ id: item.id, name: item.name })),
    })),
  };
}

export async function saveMenuAvailabilitySchedule(
  context: TenantContext,
  input: unknown,
  scheduleId?: string,
) {
  const parsed = menuAvailabilityScheduleSchema.parse(input);
  const db = getDb();

  try {
    await db.transaction(async (transaction) => {
      const [categoryRows, itemRows] = await Promise.all([
        parsed.categoryIds.length
          ? transaction
              .select({ id: menuCategories.id })
              .from(menuCategories)
              .where(
                and(
                  eq(menuCategories.organizationId, context.organizationId),
                  inArray(menuCategories.id, parsed.categoryIds),
                ),
              )
          : Promise.resolve([]),
        parsed.itemIds.length
          ? transaction
              .select({ id: menuItems.id })
              .from(menuItems)
              .where(
                and(
                  eq(menuItems.organizationId, context.organizationId),
                  inArray(menuItems.id, parsed.itemIds),
                ),
              )
          : Promise.resolve([]),
      ]);
      if (categoryRows.length !== parsed.categoryIds.length) {
        throw new MenuAvailabilityNotFoundError(
          "One or more menu categories were not found.",
        );
      }
      if (itemRows.length !== parsed.itemIds.length) {
        throw new MenuAvailabilityNotFoundError(
          "One or more menu products were not found.",
        );
      }

      let resolvedScheduleId = scheduleId;
      if (scheduleId) {
        const [schedule] = await transaction
          .update(menuAvailabilitySchedules)
          .set({
            name: parsed.name,
            isEnabled: parsed.isEnabled,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(menuAvailabilitySchedules.id, scheduleId),
              eq(
                menuAvailabilitySchedules.organizationId,
                context.organizationId,
              ),
            ),
          )
          .returning({ id: menuAvailabilitySchedules.id });
        if (!schedule) {
          throw new MenuAvailabilityNotFoundError(
            "Menu availability schedule not found.",
          );
        }
      } else {
        const [schedule] = await transaction
          .insert(menuAvailabilitySchedules)
          .values({
            organizationId: context.organizationId,
            name: parsed.name,
            isEnabled: parsed.isEnabled,
          })
          .returning({ id: menuAvailabilitySchedules.id });
        resolvedScheduleId = schedule.id;
      }

      await transaction
        .delete(menuAvailabilityPeriods)
        .where(
          and(
            eq(menuAvailabilityPeriods.scheduleId, resolvedScheduleId!),
            eq(menuAvailabilityPeriods.organizationId, context.organizationId),
          ),
        );
      await transaction
        .delete(menuCategoryAvailabilitySchedules)
        .where(
          and(
            eq(
              menuCategoryAvailabilitySchedules.scheduleId,
              resolvedScheduleId!,
            ),
            eq(
              menuCategoryAvailabilitySchedules.organizationId,
              context.organizationId,
            ),
          ),
        );
      await transaction
        .delete(menuItemAvailabilitySchedules)
        .where(
          and(
            eq(menuItemAvailabilitySchedules.scheduleId, resolvedScheduleId!),
            eq(
              menuItemAvailabilitySchedules.organizationId,
              context.organizationId,
            ),
          ),
        );

      const sortOrderByDay = new Map<number, number>();
      if (parsed.periods.length) {
        await transaction.insert(menuAvailabilityPeriods).values(
          parsed.periods.map((period) => {
            const sortOrder = sortOrderByDay.get(period.dayOfWeek) ?? 0;
            sortOrderByDay.set(period.dayOfWeek, sortOrder + 1);
            return {
              ...period,
              organizationId: context.organizationId,
              scheduleId: resolvedScheduleId!,
              sortOrder,
            };
          }),
        );
      }
      if (parsed.categoryIds.length) {
        await transaction.insert(menuCategoryAvailabilitySchedules).values(
          parsed.categoryIds.map((categoryId) => ({
            organizationId: context.organizationId,
            categoryId,
            scheduleId: resolvedScheduleId!,
          })),
        );
      }
      if (parsed.itemIds.length) {
        await transaction.insert(menuItemAvailabilitySchedules).values(
          parsed.itemIds.map((menuItemId) => ({
            organizationId: context.organizationId,
            menuItemId,
            scheduleId: resolvedScheduleId!,
          })),
        );
      }
    });
  } catch (error) {
    if (hasPostgresErrorCode(error, "23505")) {
      throw new MenuAvailabilityConflictError(
        "A menu availability schedule with this name already exists.",
      );
    }
    throw error;
  }

  return getMenuAvailabilityConfiguration(context);
}
