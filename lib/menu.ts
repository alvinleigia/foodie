import { and, asc, eq } from "drizzle-orm";

import { drinkCategories } from "@/data/drinks";
import { getDb } from "@/db";
import { menuCategories, menuItems } from "@/db/schema";
import { MenuCategoryRecord } from "@/types/menu";

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
  table: typeof menuCategories | typeof menuItems,
  baseName: string,
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
      .where(eq(table.slug, candidate))
      .limit(1);

    if (!existing || existing.id === excludeId) {
      return candidate;
    }

    suffix += 1;
    candidate = `${fallbackBase}-${suffix}`;
  }
}

export async function ensureMenuSeeded() {
  const db = getDb();
  const [existingCategory] = await db
    .select({ id: menuCategories.id })
    .from(menuCategories)
    .limit(1);

  if (existingCategory) {
    return;
  }

  for (const category of defaultMenuSeed) {
    const [createdCategory] = await db
      .insert(menuCategories)
      .values({
        slug: category.slug,
        name: category.name,
        description: category.description,
        sortOrder: category.sortOrder,
        isActive: category.isActive,
      })
      .returning({ id: menuCategories.id });

    if (!createdCategory) {
      continue;
    }

    if (category.items.length > 0) {
      await db.insert(menuItems).values(
        category.items.map((item) => ({
          categoryId: createdCategory.id,
          slug: item.slug,
          name: item.name,
          description: item.description,
          price: item.price,
          imageUrl: item.imageUrl,
          sortOrder: item.sortOrder,
          isActive: item.isActive,
        })),
      );
    }
  }
}

function groupMenuData(
  categories: typeof menuCategories.$inferSelect[],
  items: typeof menuItems.$inferSelect[],
  includeInactive: boolean,
) {
  const categoryMap = new Map<string, MenuCategoryRecord>();

  for (const category of categories) {
    if (!includeInactive && !category.isActive) {
      continue;
    }

    categoryMap.set(category.id, {
      id: category.id,
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
      categoryId: item.categoryId,
      slug: item.slug,
      name: item.name,
      description: item.description,
      price: item.price,
      imageUrl: item.imageUrl,
      sortOrder: item.sortOrder,
      isActive: item.isActive,
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

export async function getPublicMenu() {
  await ensureMenuSeeded();
  const db = getDb();
  const categories = await db
    .select()
    .from(menuCategories)
    .orderBy(asc(menuCategories.sortOrder), asc(menuCategories.name));
  const items = await db
    .select()
    .from(menuItems)
    .orderBy(asc(menuItems.sortOrder), asc(menuItems.name));

  return groupMenuData(categories, items, false);
}

export async function getAdminMenu() {
  await ensureMenuSeeded();
  const db = getDb();
  const categories = await db
    .select()
    .from(menuCategories)
    .orderBy(asc(menuCategories.sortOrder), asc(menuCategories.name));
  const items = await db
    .select()
    .from(menuItems)
    .orderBy(asc(menuItems.sortOrder), asc(menuItems.name));

  return groupMenuData(categories, items, true);
}

export async function getMenuSelectionSnapshot(categoryId: string, itemId: string) {
  await ensureMenuSeeded();
  const db = getDb();

  const [category] = await db
    .select()
    .from(menuCategories)
    .where(and(eq(menuCategories.id, categoryId), eq(menuCategories.isActive, true)))
    .limit(1);

  if (!category) {
    return { category: null, item: null };
  }

  const [item] = await db
    .select()
    .from(menuItems)
    .where(
      and(
        eq(menuItems.id, itemId),
        eq(menuItems.categoryId, category.id),
        eq(menuItems.isActive, true),
      ),
    )
    .limit(1);

  return { category, item: item ?? null };
}

export async function createMenuCategory(input: {
  name: string;
  description?: string | null;
  sortOrder: number;
  isActive: boolean;
}) {
  await ensureMenuSeeded();
  const db = getDb();
  const slug = await ensureUniqueSlug(menuCategories, input.name);

  const [createdCategory] = await db
    .insert(menuCategories)
    .values({
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
) {
  await ensureMenuSeeded();
  const db = getDb();
  const slug = await ensureUniqueSlug(menuCategories, input.name, categoryId);

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
    .where(eq(menuCategories.id, categoryId))
    .returning();

  return updatedCategory ?? null;
}

export async function createMenuItem(input: {
  categoryId: string;
  name: string;
  description?: string | null;
  price?: string | null;
  imageUrl?: string | null;
  sortOrder: number;
  isActive: boolean;
}) {
  await ensureMenuSeeded();
  const db = getDb();
  const [category] = await db
    .select({ id: menuCategories.id })
    .from(menuCategories)
    .where(eq(menuCategories.id, input.categoryId))
    .limit(1);

  if (!category) {
    throw new Error("Category not found.");
  }

  const slug = await ensureUniqueSlug(menuItems, input.name);

  const [createdItem] = await db
    .insert(menuItems)
    .values({
      categoryId: input.categoryId,
      slug,
      name: input.name,
      description: input.description ?? null,
      price: input.price ?? null,
      imageUrl: input.imageUrl ?? null,
      sortOrder: input.sortOrder,
      isActive: input.isActive,
      updatedAt: new Date(),
    })
    .returning();

  return createdItem;
}

export async function updateMenuItem(
  itemId: string,
  input: {
    categoryId: string;
    name: string;
    description?: string | null;
    price?: string | null;
    imageUrl?: string | null;
    sortOrder: number;
    isActive: boolean;
  },
) {
  await ensureMenuSeeded();
  const db = getDb();
  const [category] = await db
    .select({ id: menuCategories.id })
    .from(menuCategories)
    .where(eq(menuCategories.id, input.categoryId))
    .limit(1);

  if (!category) {
    throw new Error("Category not found.");
  }

  const slug = await ensureUniqueSlug(menuItems, input.name, itemId);

  const [updatedItem] = await db
    .update(menuItems)
    .set({
      categoryId: input.categoryId,
      slug,
      name: input.name,
      description: input.description ?? null,
      price: input.price ?? null,
      imageUrl: input.imageUrl ?? null,
      sortOrder: input.sortOrder,
      isActive: input.isActive,
      updatedAt: new Date(),
    })
    .where(eq(menuItems.id, itemId))
    .returning();

  return updatedItem ?? null;
}

export function formatMenuPrice(price: string | null) {
  if (!price) {
    return null;
  }

  return `INR ${Number(price).toFixed(2)}`;
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

export async function exportMenuCsv() {
  const categories = await getAdminMenu();

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
    ]
      .map(escapeCsvValue)
      .join(","),
  );

  return [headers.join(","), ...body].join("\n");
}

export async function importMenuCsv(csvText: string) {
  await ensureMenuSeeded();
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

  const existingCategories = await db.select().from(menuCategories);
  const existingItems = await db.select().from(menuItems);

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
      });
      categoriesBySlug.set(category.slug, category);
      categoriesByName.set(category.name.toLowerCase(), category);
      createdCategories += 1;
    } else {
      const updatedCategory = await updateMenuCategory(category.id, {
        name: categoryName,
        description: categoryDescription,
        sortOrder: categorySortOrder,
        isActive: categoryActive,
      });

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
      });
      existingItems.push(createdItem);
      createdItems += 1;
    } else {
      const updatedItem = await updateMenuItem(existingItem.id, {
        categoryId: category.id,
        name: itemName,
        description: itemDescription,
        price: itemPrice,
        imageUrl: itemImageUrl,
        sortOrder: itemSortOrder,
        isActive: itemActive,
      });

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
    categories: await getAdminMenu(),
    summary: {
      createdCategories,
      updatedCategories,
      createdItems,
      updatedItems,
    },
  };
}
