import { expect, test } from "@playwright/test";

import { filterMenuCategories } from "@/lib/menu-search";
import type { MenuCategoryRecord, MenuItemRecord } from "@/types/menu";

function menuItem(id: string, name: string, description: string | null): MenuItemRecord {
  return {
    id, name, description,
    categoryId: "food", organizationId: "restaurant", slug: id,
    imageUrl: null, price: "5.00", sortOrder: 0,
    isActive: true, isSoldOut: false,
  };
}

const categories: MenuCategoryRecord[] = [
  {
    id: "food", organizationId: "restaurant", slug: "food", name: "Small Bites",
    description: null, isActive: true, sortOrder: 0,
    items: [
      {
        ...menuItem("burger", "Beef Burger", "Grilled with cheese"),
        tags: [{
          id: "grilled", name: "Grilled", slug: "grilled", description: null,
          color: "green", kind: "ATTRIBUTE", sortOrder: 0, isActive: true,
        }],
      },
      menuItem("puff", "Vegetable Puff", null),
    ],
  },
  {
    id: "drinks", organizationId: "restaurant", slug: "drinks", name: "Cold Drinks",
    description: null, isActive: true, sortOrder: 1,
    items: [{ ...menuItem("coffee", "Iced Coffee", "Freshly brewed"), categoryId: "drinks" }],
  },
];

test.describe("menu search", () => {
  test("keeps the full menu when search and tag are empty", () => {
    expect(filterMenuCategories(categories, "   ", null)).toBe(categories);
  });

  test("matches item names without case or whitespace sensitivity", () => {
    const filtered = filterMenuCategories(categories, "  BEEF   BURGER  ", null);
    expect(filtered.map((category) => category.id)).toEqual(["food"]);
    expect(filtered[0].items.map((item) => item.id)).toEqual(["burger"]);
  });

  test("also matches descriptions and category names", () => {
    expect(filterMenuCategories(categories, "cheese", null)[0].items[0].id).toBe("burger");
    expect(filterMenuCategories(categories, "cold", null)[0].items[0].id).toBe("coffee");
  });

  test("combines tags with search and leaves the original menu untouched", () => {
    expect(filterMenuCategories(categories, "burger", "grilled")[0].items[0].id).toBe("burger");
    expect(filterMenuCategories(categories, "puff", "grilled")).toEqual([]);
    expect(filterMenuCategories(categories, "nothing-matches", null)).toEqual([]);
    expect(categories[0].items).toHaveLength(2);
    expect(categories[1].items).toHaveLength(1);
  });
});
