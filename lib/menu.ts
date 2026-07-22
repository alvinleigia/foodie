import { and, asc, eq, inArray } from "drizzle-orm";

import { drinkCategories } from "@/data/drinks";
import { getDb } from "@/db";
import {
  inventoryItems,
  menuCategories,
  menuItemModifierGroups,
  menuItems,
  menuItemTags,
  menuTags,
  modifierGroups,
  modifierOptions,
  organizations,
} from "@/db/schema";
import { formatPrice } from "@/lib/formatters";
import { DEFAULT_CURRENCY } from "@/lib/locale-defaults";
import { getDefaultTenantContext, TenantContext } from "@/lib/tenant-context";
import { getActivePrepStation } from "@/lib/prep-stations";
import { MenuCategoryRecord } from "@/types/menu";
import type {
  MenuItemRecord,
  MenuModifierGroupRecord,
  MenuModifierOptionRecord,
  MenuTagRecord,
} from "@/types/menu";

const defaultMenuSeed = drinkCategories.map((category, categoryIndex) => ({
  slug: category.id,
  name: category.name,
  description: null,
  sortOrder: categoryIndex,
  isActive: true,
  items: category.drinks.map((drink, drinkIndex) => ({
    slug: drink.id,
    name: drink.name,
    description: null,
    price: null,
    imageUrl: null,
    sortOrder: drinkIndex,
    isActive: drink.isActive,
    isSoldOut: false,
  })),
}));

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

async function ensureUniqueSlug(
  table: typeof menuCategories | typeof menuItems | typeof modifierGroups | typeof modifierOptions,
  baseName: string,
  organizationId: string,
  excludeId?: string,
) {
  const db = getDb();
  const fallbackBase = slugify(baseName) || "item";
  let candidate = fallbackBase;
  let suffix = 1;

  while (true) {
    const [existing] = await db
      .select({ id: table.id })
      .from(table)
      .where(
        and(
          eq(table.organizationId, organizationId),
          eq(table.slug, candidate),
        ),
      )
      .limit(1);

    if (!existing || existing.id === excludeId) {
      return candidate;
    }

    suffix += 1;
    candidate = `${fallbackBase}-${suffix}`;
  }
}

export async function seedStarterMenu(context: TenantContext = getDefaultTenantContext()) {
  const db = getDb();
  const [existingCategory] = await db
    .select({ id: menuCategories.id })
    .from(menuCategories)
    .where(
      and(
        eq(menuCategories.organizationId, context.organizationId),
      ),
    )
    .limit(1);

  if (existingCategory) {
    return {
      createdCategories: 0,
      createdItems: 0,
      skipped: true,
    };
  }

  let createdCategories = 0;
  let createdItems = 0;

  for (const category of defaultMenuSeed) {
    const categorySlug = await ensureUniqueSlug(
      menuCategories,
      category.slug,
      context.organizationId,
    );
    const [createdCategory] = await db
      .insert(menuCategories)
      .values({
        organizationId: context.organizationId,
        slug: categorySlug,
        name: category.name,
        description: category.description,
        sortOrder: category.sortOrder,
        isActive: category.isActive,
      })
      .returning({ id: menuCategories.id });

    if (!createdCategory) {
      continue;
    }

    createdCategories += 1;

    if (category.items.length > 0) {
      const seededItems = [];

      for (const item of category.items) {
        seededItems.push({
          organizationId: context.organizationId,
          categoryId: createdCategory.id,
          slug: await ensureUniqueSlug(
            menuItems,
            item.slug,
            context.organizationId,
          ),
          name: item.name,
          description: item.description,
          price: item.price,
          imageUrl: item.imageUrl,
          sortOrder: item.sortOrder,
          isActive: item.isActive,
          isSoldOut: item.isSoldOut,
        });
      }

      await db.insert(menuItems).values(seededItems);
      createdItems += seededItems.length;
    }
  }

  return {
    createdCategories,
    createdItems,
    skipped: false,
  };
}

export async function clearMenu(context: TenantContext = getDefaultTenantContext()) {
  const db = getDb();
  const deletedItems = await db
    .delete(menuItems)
    .where(
      and(
        eq(menuItems.organizationId, context.organizationId),
      ),
    )
    .returning({ id: menuItems.id });
  const deletedCategories = await db
    .delete(menuCategories)
    .where(
      and(
        eq(menuCategories.organizationId, context.organizationId),
      ),
    )
    .returning({ id: menuCategories.id });

  return {
    deletedCategories: deletedCategories.length,
    deletedItems: deletedItems.length,
  };
}

function groupMenuData(
  categories: typeof menuCategories.$inferSelect[],
  items: typeof menuItems.$inferSelect[],
  includeInactive: boolean,
  inventoryByItemId = new Map<string, typeof inventoryItems.$inferSelect>(),
  tagsByItemId = new Map<string, MenuTagRecord[]>(),
  modifierGroupsByItemId = new Map<string, MenuModifierGroupRecord[]>(),
  includePrepStationRouting = false,
) {
  const categoryMap = new Map<string, MenuCategoryRecord>();

  for (const category of categories) {
    if (!includeInactive && !category.isActive) {
      continue;
    }

    categoryMap.set(category.id, {
      id: category.id,
      organizationId: category.organizationId,
      slug: category.slug,
      name: category.name,
      description: category.description,
      sortOrder: category.sortOrder,
      isActive: category.isActive,
      items: [],
    });
  }

  for (const item of items) {
    if (!includeInactive && !item.isActive) {
      continue;
    }

    const category = categoryMap.get(item.categoryId);

    if (!category) {
      continue;
    }

    category.items.push({
      id: item.id,
      organizationId: item.organizationId,
      categoryId: item.categoryId,
      slug: item.slug,
      name: item.name,
      description: item.description,
      price: item.price,
      imageUrl: item.imageUrl,
      sortOrder: item.sortOrder,
      isActive: item.isActive,
      isSoldOut: item.isSoldOut,
      ...(includePrepStationRouting
        ? { prepStationId: item.prepStationId }
        : {}),
      tags: tagsByItemId.get(item.id) ?? [],
      modifierGroups: modifierGroupsByItemId.get(item.id) ?? [],
      ...getMenuInventoryState(inventoryByItemId.get(item.id)),
    });
  }

  return Array.from(categoryMap.values())
    .map((category) => ({
      ...category,
      items: category.items.sort((left, right) => {
        if (left.sortOrder !== right.sortOrder) {
          return left.sortOrder - right.sortOrder;
        }

        return left.name.localeCompare(right.name);
      }),
    }))
    .filter((category) => includeInactive || category.items.length > 0)
    .sort((left, right) => {
      if (left.sortOrder !== right.sortOrder) {
        return left.sortOrder - right.sortOrder;
      }

      return left.name.localeCompare(right.name);
    });
}

function getMenuInventoryState(inventory: typeof inventoryItems.$inferSelect | undefined) {
  if (!inventory?.isTracked) {
    return {
      inventoryStatus: "not_tracked" as const,
      inventoryQuantity: inventory?.currentQuantity ?? null,
      isUnavailableDueToStock: false,
    };
  }

  const currentQuantity = Number(inventory.currentQuantity);
  const lowStockThreshold = Number(inventory.lowStockThreshold);
  const inventoryStatus: NonNullable<MenuItemRecord["inventoryStatus"]> =
    currentQuantity <= 0
      ? "out"
      : lowStockThreshold > 0 && currentQuantity <= lowStockThreshold
        ? "low"
        : "ok";

  return {
    inventoryStatus,
    inventoryQuantity: inventory.currentQuantity,
    isUnavailableDueToStock: inventoryStatus === "out",
  };
}

async function getInventoryByMenuItemId(
  itemIds: string[],
  context: TenantContext,
) {
  if (itemIds.length === 0) {
    return new Map<string, typeof inventoryItems.$inferSelect>();
  }

  const db = getDb();
  const inventory = await db
    .select()
    .from(inventoryItems)
    .where(
      and(
        inArray(inventoryItems.menuItemId, itemIds),
        eq(inventoryItems.organizationId, context.organizationId),
      ),
    );

  return new Map(inventory.map((item) => [item.menuItemId, item]));
}

export async function getActiveMenuTags() {
  const db = getDb();

  return db
    .select({
      id: menuTags.id,
      slug: menuTags.slug,
      name: menuTags.name,
      description: menuTags.description,
      color: menuTags.color,
      sortOrder: menuTags.sortOrder,
      isActive: menuTags.isActive,
    })
    .from(menuTags)
    .where(eq(menuTags.isActive, true))
    .orderBy(asc(menuTags.sortOrder), asc(menuTags.name));
}

async function getMenuTagsByItemId(itemIds: string[]) {
  if (itemIds.length === 0) {
    return new Map<string, MenuTagRecord[]>();
  }

  const db = getDb();
  const rows = await db
    .select({
      menuItemId: menuItemTags.menuItemId,
      id: menuTags.id,
      slug: menuTags.slug,
      name: menuTags.name,
      description: menuTags.description,
      color: menuTags.color,
      sortOrder: menuTags.sortOrder,
      isActive: menuTags.isActive,
    })
    .from(menuItemTags)
    .innerJoin(menuTags, eq(menuItemTags.tagId, menuTags.id))
    .where(
      and(
        inArray(menuItemTags.menuItemId, itemIds),
        eq(menuTags.isActive, true),
      ),
    )
    .orderBy(asc(menuTags.sortOrder), asc(menuTags.name));

  const tagsByItemId = new Map<string, MenuTagRecord[]>();

  for (const row of rows) {
    const itemTags = tagsByItemId.get(row.menuItemId) ?? [];
    itemTags.push({
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      color: row.color,
      sortOrder: row.sortOrder,
      isActive: row.isActive,
    });
    tagsByItemId.set(row.menuItemId, itemTags);
  }

  return tagsByItemId;
}

function serializeModifierOption(
  option: typeof modifierOptions.$inferSelect,
): MenuModifierOptionRecord {
  return {
    id: option.id,
    groupId: option.groupId,
    slug: option.slug,
    name: option.name,
    priceDelta: option.priceDelta,
    sortOrder: option.sortOrder,
    isActive: option.isActive,
    isSoldOut: option.isSoldOut,
  };
}

function serializeModifierGroup(
  group: typeof modifierGroups.$inferSelect,
  options: MenuModifierOptionRecord[],
): MenuModifierGroupRecord {
  return {
    id: group.id,
    organizationId: group.organizationId,
    slug: group.slug,
    name: group.name,
    description: group.description,
    selectionType: group.selectionType,
    isRequired: group.isRequired,
    minSelections: group.minSelections,
    maxSelections: group.maxSelections,
    sortOrder: group.sortOrder,
    isActive: group.isActive,
    options,
  };
}

export async function getMenuModifierGroups(
  context: TenantContext = getDefaultTenantContext(),
  includeInactive = true,
) {
  const db = getDb();
  const groupRows = await db
    .select()
    .from(modifierGroups)
    .where(
      and(
        eq(modifierGroups.organizationId, context.organizationId),
      ),
    )
    .orderBy(asc(modifierGroups.sortOrder), asc(modifierGroups.name));

  const visibleGroups = includeInactive
    ? groupRows
    : groupRows.filter((group) => group.isActive);

  if (visibleGroups.length === 0) {
    return [];
  }

  const optionRows = await db
    .select()
    .from(modifierOptions)
    .where(inArray(modifierOptions.groupId, visibleGroups.map((group) => group.id)))
    .orderBy(asc(modifierOptions.sortOrder), asc(modifierOptions.name));
  const optionsByGroupId = new Map<string, MenuModifierOptionRecord[]>();

  for (const option of optionRows) {
    if (!includeInactive && (!option.isActive || option.isSoldOut)) {
      continue;
    }

    const groupOptions = optionsByGroupId.get(option.groupId) ?? [];
    groupOptions.push(serializeModifierOption(option));
    optionsByGroupId.set(option.groupId, groupOptions);
  }

  return visibleGroups.map((group) =>
    serializeModifierGroup(group, optionsByGroupId.get(group.id) ?? []),
  );
}

async function getMenuModifierGroupsByItemId(
  itemIds: string[],
  context: TenantContext,
  includeInactive: boolean,
) {
  if (itemIds.length === 0) {
    return new Map<string, MenuModifierGroupRecord[]>();
  }

  const db = getDb();
  const links = await db
    .select({
      menuItemId: menuItemModifierGroups.menuItemId,
      sortOrder: menuItemModifierGroups.sortOrder,
      group: modifierGroups,
    })
    .from(menuItemModifierGroups)
    .innerJoin(
      modifierGroups,
      eq(menuItemModifierGroups.modifierGroupId, modifierGroups.id),
    )
    .where(
      and(
        inArray(menuItemModifierGroups.menuItemId, itemIds),
        eq(menuItemModifierGroups.isActive, true),
        eq(modifierGroups.organizationId, context.organizationId),
      ),
    )
    .orderBy(asc(menuItemModifierGroups.sortOrder), asc(modifierGroups.sortOrder), asc(modifierGroups.name));

  const visibleLinks = includeInactive
    ? links
    : links.filter((link) => link.group.isActive);

  if (visibleLinks.length === 0) {
    return new Map<string, MenuModifierGroupRecord[]>();
  }

  const groupIds = Array.from(new Set(visibleLinks.map((link) => link.group.id)));
  const optionRows = await db
    .select()
    .from(modifierOptions)
    .where(inArray(modifierOptions.groupId, groupIds))
    .orderBy(asc(modifierOptions.sortOrder), asc(modifierOptions.name));
  const optionsByGroupId = new Map<string, MenuModifierOptionRecord[]>();

  for (const option of optionRows) {
    if (!includeInactive && (!option.isActive || option.isSoldOut)) {
      continue;
    }

    const groupOptions = optionsByGroupId.get(option.groupId) ?? [];
    groupOptions.push(serializeModifierOption(option));
    optionsByGroupId.set(option.groupId, groupOptions);
  }

  const groupsByItemId = new Map<string, MenuModifierGroupRecord[]>();

  for (const link of visibleLinks) {
    const itemGroups = groupsByItemId.get(link.menuItemId) ?? [];
    itemGroups.push(
      serializeModifierGroup(link.group, optionsByGroupId.get(link.group.id) ?? []),
    );
    itemGroups.sort((left, right) => {
      if (left.sortOrder !== right.sortOrder) {
        return left.sortOrder - right.sortOrder;
      }

      return left.name.localeCompare(right.name);
    });
    groupsByItemId.set(link.menuItemId, itemGroups);
  }

  return groupsByItemId;
}

function normalizeMenuTagIds(tagIds: string[] | undefined) {
  return Array.from(new Set(tagIds ?? []));
}

function normalizeMenuModifierGroupIds(groupIds: string[] | undefined) {
  return Array.from(new Set(groupIds ?? []));
}

async function assertMenuTagsExist(tagIds: string[]) {
  if (tagIds.length === 0) {
    return;
  }

  const db = getDb();
  const existingTags = await db
    .select({ id: menuTags.id })
    .from(menuTags)
    .where(
      and(
        inArray(menuTags.id, tagIds),
        eq(menuTags.isActive, true),
      ),
    );

  if (existingTags.length !== tagIds.length) {
    throw new Error("One or more menu tags are invalid.");
  }
}

async function assertMenuModifierGroupsExist(groupIds: string[], context: TenantContext) {
  if (groupIds.length === 0) {
    return;
  }

  const db = getDb();
  const existingGroups = await db
    .select({ id: modifierGroups.id })
    .from(modifierGroups)
    .where(
      and(
        inArray(modifierGroups.id, groupIds),
        eq(modifierGroups.organizationId, context.organizationId),
      ),
    );

  if (existingGroups.length !== groupIds.length) {
    throw new Error("One or more add-on groups are invalid.");
  }
}

export async function getPublicMenu(
  context: TenantContext = getDefaultTenantContext(),
  options: { includeInventory?: boolean } = {},
) {
  const db = getDb();
  const categories = await db
    .select()
    .from(menuCategories)
    .where(
      and(
        eq(menuCategories.organizationId, context.organizationId),
      ),
    )
    .orderBy(asc(menuCategories.sortOrder), asc(menuCategories.name));
  const items = await db
    .select()
    .from(menuItems)
    .where(
      and(
        eq(menuItems.organizationId, context.organizationId),
      ),
    )
    .orderBy(asc(menuItems.sortOrder), asc(menuItems.name));
  const inventoryByItemId =
    options.includeInventory === false
      ? new Map<string, typeof inventoryItems.$inferSelect>()
      : await getInventoryByMenuItemId(
          items.map((item) => item.id),
          context,
        );
  const tagsByItemId = await getMenuTagsByItemId(items.map((item) => item.id));
  const modifierGroupsByItemId = await getMenuModifierGroupsByItemId(
    items.map((item) => item.id),
    context,
    false,
  );

  return groupMenuData(
    categories,
    items,
    false,
    inventoryByItemId,
    tagsByItemId,
    modifierGroupsByItemId,
  );
}

export async function getAdminMenu(context: TenantContext = getDefaultTenantContext()) {
  const db = getDb();
  const categories = await db
    .select()
    .from(menuCategories)
    .where(
      and(
        eq(menuCategories.organizationId, context.organizationId),
      ),
    )
    .orderBy(asc(menuCategories.sortOrder), asc(menuCategories.name));
  const items = await db
    .select()
    .from(menuItems)
    .where(
      and(
        eq(menuItems.organizationId, context.organizationId),
      ),
    )
    .orderBy(asc(menuItems.sortOrder), asc(menuItems.name));
  const tagsByItemId = await getMenuTagsByItemId(items.map((item) => item.id));
  const modifierGroupsByItemId = await getMenuModifierGroupsByItemId(
    items.map((item) => item.id),
    context,
    true,
  );

  return groupMenuData(
    categories,
    items,
    true,
    undefined,
    tagsByItemId,
    modifierGroupsByItemId,
    true,
  );
}

export async function getTenantMenuCurrency(
  context: TenantContext = getDefaultTenantContext(),
) {
  const [organization] = await getDb()
    .select({ currency: organizations.currency })
    .from(organizations)
    .where(eq(organizations.id, context.organizationId))
    .limit(1);

  return organization?.currency ?? DEFAULT_CURRENCY;
}

export async function getMenuSelectionSnapshot(
  categoryId: string,
  itemId: string,
  context: TenantContext = getDefaultTenantContext(),
  options: { includeInventory?: boolean } = {},
) {
  const db = getDb();

  const [category] = await db
    .select()
    .from(menuCategories)
    .where(
      and(
        eq(menuCategories.id, categoryId),
        eq(menuCategories.organizationId, context.organizationId),
        eq(menuCategories.isActive, true),
      ),
    )
    .limit(1);

  if (!category) {
    return { category: null, inventory: null, item: null, prepStation: null };
  }

  const [item] = await db
    .select()
    .from(menuItems)
    .where(
      and(
        eq(menuItems.id, itemId),
        eq(menuItems.organizationId, context.organizationId),
        eq(menuItems.categoryId, category.id),
        eq(menuItems.isActive, true),
        eq(menuItems.isSoldOut, false),
      ),
    )
    .limit(1);

  if (!item) {
    return { category, inventory: null, item: null, prepStation: null };
  }

  const prepStation = await getActivePrepStation(item.prepStationId, context);

  if (options.includeInventory === false) {
    return { category, inventory: null, item, prepStation };
  }

  const [inventory] = await db
    .select()
    .from(inventoryItems)
    .where(
      and(
        eq(inventoryItems.menuItemId, item.id),
        eq(inventoryItems.organizationId, context.organizationId),
      ),
    )
    .limit(1);

  return { category, inventory: inventory ?? null, item, prepStation };
}

export async function getMenuModifierSelectionSnapshots(
  itemId: string,
  requestedModifiers: Array<{ groupId: string; modifierId: string; quantity: number }>,
  context: TenantContext = getDefaultTenantContext(),
) {
  if (requestedModifiers.length === 0) {
    return [];
  }

  const groupsByItemId = await getMenuModifierGroupsByItemId([itemId], context, false);
  const allowedGroups = groupsByItemId.get(itemId) ?? [];
  const allowedGroupMap = new Map(allowedGroups.map((group) => [group.id, group]));
  const selectionsByGroupId = new Map<string, number>();
  const snapshots = [];

  for (const requestedModifier of requestedModifiers) {
    const group = allowedGroupMap.get(requestedModifier.groupId);

    if (!group) {
      throw new Error("Invalid add-on selection.");
    }

    const option = group.options.find(
      (groupOption) => groupOption.id === requestedModifier.modifierId,
    );

    if (!option || !option.isActive || option.isSoldOut) {
      throw new Error("One or more add-ons are unavailable.");
    }

    const nextGroupQuantity =
      (selectionsByGroupId.get(group.id) ?? 0) + requestedModifier.quantity;
    selectionsByGroupId.set(group.id, nextGroupQuantity);

    snapshots.push({
      modifierGroupId: group.id,
      modifierGroupName: group.name,
      modifierId: option.id,
      modifierName: option.name,
      quantity: requestedModifier.quantity,
      priceDelta: option.priceDelta,
    });
  }

  for (const group of allowedGroups) {
    const selectedQuantity = selectionsByGroupId.get(group.id) ?? 0;

    if (group.isRequired && selectedQuantity < Math.max(group.minSelections, 1)) {
      throw new Error(`${group.name} requires a selection.`);
    }

    if (group.maxSelections !== null && selectedQuantity > group.maxSelections) {
      throw new Error(`${group.name} allows only ${group.maxSelections} selection(s).`);
    }

    if (group.selectionType === "SINGLE" && selectedQuantity > 1) {
      throw new Error(`${group.name} allows only one selection.`);
    }
  }

  return snapshots;
}

export async function createMenuModifierGroup(input: {
  name: string;
  description?: string | null;
  selectionType: "SINGLE" | "MULTIPLE";
  isRequired: boolean;
  minSelections: number;
  maxSelections: number | null;
  sortOrder: number;
  isActive: boolean;
}, context: TenantContext = getDefaultTenantContext()) {
  const db = getDb();
  const slug = await ensureUniqueSlug(
    modifierGroups,
    input.name,
    context.organizationId,
  );
  const [createdGroup] = await db
    .insert(modifierGroups)
    .values({
      organizationId: context.organizationId,
      slug,
      name: input.name,
      description: input.description ?? null,
      selectionType: input.selectionType,
      isRequired: input.isRequired,
      minSelections: input.minSelections,
      maxSelections: input.maxSelections,
      sortOrder: input.sortOrder,
      isActive: input.isActive,
      updatedAt: new Date(),
    })
    .returning();

  return createdGroup;
}

export async function createMenuModifierOption(input: {
  groupId: string;
  name: string;
  priceDelta: string;
  sortOrder: number;
  isActive: boolean;
  isSoldOut: boolean;
}, context: TenantContext = getDefaultTenantContext()) {
  const db = getDb();
  const [group] = await db
    .select({ id: modifierGroups.id })
    .from(modifierGroups)
    .where(
      and(
        eq(modifierGroups.id, input.groupId),
        eq(modifierGroups.organizationId, context.organizationId),
      ),
    )
    .limit(1);

  if (!group) {
    throw new Error("Add-on group not found.");
  }

  const slug = await ensureUniqueSlug(
    modifierOptions,
    input.name,
    context.organizationId,
  );
  const [createdOption] = await db
    .insert(modifierOptions)
    .values({
      organizationId: context.organizationId,
      groupId: input.groupId,
      slug,
      name: input.name,
      priceDelta: input.priceDelta,
      sortOrder: input.sortOrder,
      isActive: input.isActive,
      isSoldOut: input.isSoldOut,
      updatedAt: new Date(),
    })
    .returning();

  return createdOption;
}

export async function createMenuCategory(input: {
  name: string;
  description?: string | null;
  sortOrder: number;
  isActive: boolean;
}, context: TenantContext = getDefaultTenantContext()) {
  const db = getDb();
  const slug = await ensureUniqueSlug(
    menuCategories,
    input.name,
    context.organizationId,
  );

  const [createdCategory] = await db
    .insert(menuCategories)
    .values({
      organizationId: context.organizationId,
      slug,
      name: input.name,
      description: input.description ?? null,
      sortOrder: input.sortOrder,
      isActive: input.isActive,
      updatedAt: new Date(),
    })
    .returning();

  return createdCategory;
}

export async function updateMenuCategory(
  categoryId: string,
  input: {
    name: string;
    description?: string | null;
    sortOrder: number;
    isActive: boolean;
  },
  context: TenantContext = getDefaultTenantContext(),
) {
  const db = getDb();
  const slug = await ensureUniqueSlug(
    menuCategories,
    input.name,
    context.organizationId,
    categoryId,
  );

  const [updatedCategory] = await db
    .update(menuCategories)
    .set({
      slug,
      name: input.name,
      description: input.description ?? null,
      sortOrder: input.sortOrder,
      isActive: input.isActive,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(menuCategories.id, categoryId),
        eq(menuCategories.organizationId, context.organizationId),
      ),
    )
    .returning();

  return updatedCategory ?? null;
}

export async function createMenuItem(input: {
  categoryId: string;
  prepStationId?: string | null;
  name: string;
  description?: string | null;
  price?: string | null;
  imageUrl?: string | null;
  sortOrder: number;
  isActive: boolean;
  isSoldOut?: boolean;
  tagIds?: string[];
  modifierGroupIds?: string[];
}, context: TenantContext = getDefaultTenantContext()) {
  const db = getDb();
  const [category] = await db
    .select({ id: menuCategories.id })
    .from(menuCategories)
    .where(
      and(
        eq(menuCategories.id, input.categoryId),
        eq(menuCategories.organizationId, context.organizationId),
      ),
    )
    .limit(1);

  if (!category) {
    throw new Error("Category not found.");
  }

  const slug = await ensureUniqueSlug(
    menuItems,
    input.name,
    context.organizationId,
  );
  const tagIds = normalizeMenuTagIds(input.tagIds);
  const modifierGroupIds = normalizeMenuModifierGroupIds(input.modifierGroupIds);
  await assertMenuTagsExist(tagIds);
  await assertMenuModifierGroupsExist(modifierGroupIds, context);
  const prepStation = await getActivePrepStation(input.prepStationId, context);

  if (input.prepStationId && !prepStation) {
    throw new Error("Preparation station not found.");
  }

  const createdItem = await db.transaction(async (tx) => {
    const [item] = await tx
      .insert(menuItems)
      .values({
        organizationId: context.organizationId,
        categoryId: input.categoryId,
        prepStationId: prepStation?.id ?? null,
        slug,
        name: input.name,
        description: input.description ?? null,
        price: input.price ?? null,
        imageUrl: input.imageUrl ?? null,
        sortOrder: input.sortOrder,
        isActive: input.isActive,
        isSoldOut: input.isSoldOut ?? false,
        updatedAt: new Date(),
      })
      .returning();

    if (tagIds.length > 0) {
      await tx.insert(menuItemTags).values(
        tagIds.map((tagId) => ({
          menuItemId: item.id,
          tagId,
        })),
      );
    }

    if (modifierGroupIds.length > 0) {
      await tx.insert(menuItemModifierGroups).values(
        modifierGroupIds.map((modifierGroupId, index) => ({
          menuItemId: item.id,
          modifierGroupId,
          sortOrder: index,
        })),
      );
    }

    return item;
  });

  return createdItem;
}

export async function updateMenuItem(
  itemId: string,
  input: {
    categoryId: string;
    prepStationId?: string | null;
    name: string;
    description?: string | null;
    price?: string | null;
    imageUrl?: string | null;
    sortOrder: number;
    isActive: boolean;
    isSoldOut?: boolean;
    tagIds?: string[];
    modifierGroupIds?: string[];
  },
  context: TenantContext = getDefaultTenantContext(),
) {
  const db = getDb();
  const [category] = await db
    .select({ id: menuCategories.id })
    .from(menuCategories)
    .where(
      and(
        eq(menuCategories.id, input.categoryId),
        eq(menuCategories.organizationId, context.organizationId),
      ),
    )
    .limit(1);

  if (!category) {
    throw new Error("Category not found.");
  }

  const slug = await ensureUniqueSlug(
    menuItems,
    input.name,
    context.organizationId,
    itemId,
  );
  const tagIds = normalizeMenuTagIds(input.tagIds);
  const modifierGroupIds = normalizeMenuModifierGroupIds(input.modifierGroupIds);
  await assertMenuTagsExist(tagIds);
  await assertMenuModifierGroupsExist(modifierGroupIds, context);
  const prepStation = await getActivePrepStation(input.prepStationId, context);

  if (input.prepStationId && !prepStation) {
    throw new Error("Preparation station not found.");
  }

  const updatedItem = await db.transaction(async (tx) => {
    const [item] = await tx
      .update(menuItems)
      .set({
        organizationId: context.organizationId,
        categoryId: input.categoryId,
        prepStationId: prepStation?.id ?? null,
        slug,
        name: input.name,
        description: input.description ?? null,
        price: input.price ?? null,
        imageUrl: input.imageUrl ?? null,
        sortOrder: input.sortOrder,
        isActive: input.isActive,
        isSoldOut: input.isSoldOut ?? false,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(menuItems.id, itemId),
          eq(menuItems.organizationId, context.organizationId),
        ),
      )
      .returning();

    if (!item) {
      return null;
    }

    await tx.delete(menuItemTags).where(eq(menuItemTags.menuItemId, item.id));
    await tx
      .delete(menuItemModifierGroups)
      .where(eq(menuItemModifierGroups.menuItemId, item.id));

    if (tagIds.length > 0) {
      await tx.insert(menuItemTags).values(
        tagIds.map((tagId) => ({
          menuItemId: item.id,
          tagId,
        })),
      );
    }

    if (modifierGroupIds.length > 0) {
      await tx.insert(menuItemModifierGroups).values(
        modifierGroupIds.map((modifierGroupId, index) => ({
          menuItemId: item.id,
          modifierGroupId,
          sortOrder: index,
        })),
      );
    }

    return item;
  });

  return updatedItem ?? null;
}

export async function updateMenuItemSoldOut(
  itemId: string,
  isSoldOut: boolean,
  context: TenantContext = getDefaultTenantContext(),
) {
  const db = getDb();

  const [updatedItem] = await db
    .update(menuItems)
    .set({
      isSoldOut,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(menuItems.id, itemId),
        eq(menuItems.organizationId, context.organizationId),
      ),
    )
    .returning();

  return updatedItem ?? null;
}

export function formatMenuPrice(price: string | null) {
  if (!price) {
    return null;
  }

  return formatPrice(price);
}

type MenuExportRow = {
  categorySlug: string;
  categoryName: string;
  categoryDescription: string;
  categorySortOrder: number;
  categoryActive: boolean;
  itemSlug: string;
  itemName: string;
  itemDescription: string;
  itemPrice: string;
  itemImageUrl: string;
  itemSortOrder: number;
  itemActive: boolean;
  itemSoldOut: boolean;
};

function escapeCsvValue(value: string | number | boolean | null | undefined) {
  const normalized = value == null ? "" : String(value);

  if (/[",\r\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, "\"\"")}"`;
  }

  return normalized;
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const nextCharacter = line[index + 1];

    if (character === "\"") {
      if (inQuotes && nextCharacter === "\"") {
        current += "\"";
        index += 1;
        continue;
      }

      inQuotes = !inQuotes;
      continue;
    }

    if (character === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += character;
  }

  values.push(current);
  return values.map((value) => value.trim());
}

function normalizeBoolean(value: string | undefined, fallback = true) {
  if (!value) {
    return fallback;
  }

  return !["false", "0", "no", "hidden", "inactive"].includes(value.trim().toLowerCase());
}

function normalizeInteger(value: string | undefined, fallback = 0) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function normalizePrice(value: string | undefined) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed.replace(/[^0-9.]/g, ""));

  if (Number.isNaN(parsed) || parsed < 0) {
    return null;
  }

  return parsed.toFixed(2);
}

function normalizeText(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function exportMenuCsv(context: TenantContext = getDefaultTenantContext()) {
  const categories = await getAdminMenu(context);

  const headers = [
    "category_slug",
    "category_name",
    "category_description",
    "category_sort_order",
    "category_active",
    "item_slug",
    "item_name",
    "item_description",
    "item_price",
    "item_image_url",
    "item_sort_order",
    "item_active",
    "item_sold_out",
  ];

  const rows: MenuExportRow[] = [];

  for (const category of categories) {
    if (category.items.length === 0) {
      rows.push({
        categorySlug: category.slug,
        categoryName: category.name,
        categoryDescription: category.description ?? "",
        categorySortOrder: category.sortOrder,
        categoryActive: category.isActive,
        itemSlug: "",
        itemName: "",
        itemDescription: "",
        itemPrice: "",
        itemImageUrl: "",
        itemSortOrder: 0,
        itemActive: true,
        itemSoldOut: false,
      });
      continue;
    }

    for (const item of category.items) {
      rows.push({
        categorySlug: slugify(category.name),
        categoryName: category.name,
        categoryDescription: category.description ?? "",
        categorySortOrder: category.sortOrder,
        categoryActive: category.isActive,
        itemSlug: item.slug,
        itemName: item.name,
        itemDescription: item.description ?? "",
        itemPrice: item.price ?? "",
        itemImageUrl: item.imageUrl ?? "",
        itemSortOrder: item.sortOrder,
        itemActive: item.isActive,
        itemSoldOut: item.isSoldOut,
      });
    }
  }

  const body = rows.map((row) =>
    [
      row.categorySlug,
      row.categoryName,
      row.categoryDescription,
      row.categorySortOrder,
      row.categoryActive,
      row.itemSlug,
      row.itemName,
      row.itemDescription,
      row.itemPrice,
      row.itemImageUrl,
      row.itemSortOrder,
      row.itemActive,
      row.itemSoldOut,
    ]
      .map(escapeCsvValue)
      .join(","),
  );

  return [headers.join(","), ...body].join("\n");
}

export async function importMenuCsv(
  csvText: string,
  context: TenantContext = getDefaultTenantContext(),
) {
  const db = getDb();
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    throw new Error("CSV must include a header row and at least one menu row.");
  }

  const headers = parseCsvLine(lines[0]);
  const requiredHeaders = ["category_name", "item_name"];

  for (const requiredHeader of requiredHeaders) {
    if (!headers.includes(requiredHeader)) {
      throw new Error(`CSV is missing required column: ${requiredHeader}`);
    }
  }

  const categorySlugIndex = headers.indexOf("category_slug");
  const categoryNameIndex = headers.indexOf("category_name");
  const categoryDescriptionIndex = headers.indexOf("category_description");
  const categorySortOrderIndex = headers.indexOf("category_sort_order");
  const categoryActiveIndex = headers.indexOf("category_active");
  const itemSlugIndex = headers.indexOf("item_slug");
  const itemNameIndex = headers.indexOf("item_name");
  const itemDescriptionIndex = headers.indexOf("item_description");
  const itemPriceIndex = headers.indexOf("item_price");
  const itemImageUrlIndex = headers.indexOf("item_image_url");
  const itemSortOrderIndex = headers.indexOf("item_sort_order");
  const itemActiveIndex = headers.indexOf("item_active");
  const itemSoldOutIndex = headers.indexOf("item_sold_out");

  const existingCategories = await db
    .select()
    .from(menuCategories)
    .where(
      and(
        eq(menuCategories.organizationId, context.organizationId),
      ),
    );
  const existingItems = await db
    .select()
    .from(menuItems)
    .where(
      and(
        eq(menuItems.organizationId, context.organizationId),
      ),
    );

  const categoriesBySlug = new Map(existingCategories.map((category) => [category.slug, category]));
  const categoriesByName = new Map(existingCategories.map((category) => [category.name.toLowerCase(), category]));

  let createdCategories = 0;
  let updatedCategories = 0;
  let createdItems = 0;
  let updatedItems = 0;

  for (const line of lines.slice(1)) {
    const values = parseCsvLine(line);

    const categoryName = values[categoryNameIndex]?.trim();
    const itemName = values[itemNameIndex]?.trim();

    if (!categoryName) {
      continue;
    }

    const categorySlug = normalizeText(values[categorySlugIndex]) ?? slugify(categoryName);
    const categoryDescription = normalizeText(values[categoryDescriptionIndex]);
    const categorySortOrder = normalizeInteger(values[categorySortOrderIndex], 0);
    const categoryActive = normalizeBoolean(values[categoryActiveIndex], true);

    let category =
      categoriesBySlug.get(categorySlug) ??
      categoriesByName.get(categoryName.toLowerCase()) ??
      null;

    if (!category) {
      category = await createMenuCategory({
        name: categoryName,
        description: categoryDescription,
        sortOrder: categorySortOrder,
        isActive: categoryActive,
      }, context);
      categoriesBySlug.set(category.slug, category);
      categoriesByName.set(category.name.toLowerCase(), category);
      createdCategories += 1;
    } else {
      const updatedCategory = await updateMenuCategory(
        category.id,
        {
          name: categoryName,
          description: categoryDescription,
          sortOrder: categorySortOrder,
          isActive: categoryActive,
        },
        context,
      );

      if (updatedCategory) {
        category = updatedCategory;
        categoriesBySlug.set(category.slug, category);
        categoriesByName.set(category.name.toLowerCase(), category);
        updatedCategories += 1;
      }
    }

    if (!itemName) {
      continue;
    }

    const itemSlug = normalizeText(values[itemSlugIndex]) ?? slugify(itemName);
    const itemDescription = normalizeText(values[itemDescriptionIndex]);
    const itemPrice = normalizePrice(values[itemPriceIndex]);
    const itemImageUrl = normalizeText(values[itemImageUrlIndex]);
    const itemSortOrder = normalizeInteger(values[itemSortOrderIndex], 0);
    const itemActive = normalizeBoolean(values[itemActiveIndex], true);
    const itemSoldOut = normalizeBoolean(values[itemSoldOutIndex], false);

    const existingItem =
      existingItems.find((item) => item.slug === itemSlug) ??
      existingItems.find(
        (item) =>
          item.categoryId === category.id && item.name.toLowerCase() === itemName.toLowerCase(),
      ) ??
      null;

    if (!existingItem) {
      const createdItem = await createMenuItem({
        categoryId: category.id,
        name: itemName,
        description: itemDescription,
        price: itemPrice,
        imageUrl: itemImageUrl,
        sortOrder: itemSortOrder,
        isActive: itemActive,
        isSoldOut: itemSoldOut,
      }, context);
      existingItems.push(createdItem);
      createdItems += 1;
    } else {
      const updatedItem = await updateMenuItem(
        existingItem.id,
        {
          categoryId: category.id,
          name: itemName,
          description: itemDescription,
          price: itemPrice,
          imageUrl: itemImageUrl,
          sortOrder: itemSortOrder,
          isActive: itemActive,
          isSoldOut: itemSoldOut,
        },
        context,
      );

      if (updatedItem) {
        const existingItemIndex = existingItems.findIndex((item) => item.id === updatedItem.id);

        if (existingItemIndex >= 0) {
          existingItems[existingItemIndex] = updatedItem;
        }

        updatedItems += 1;
      }
    }
  }

  return {
    categories: await getAdminMenu(context),
    summary: {
      createdCategories,
      updatedCategories,
      createdItems,
      updatedItems,
    },
  };
}
