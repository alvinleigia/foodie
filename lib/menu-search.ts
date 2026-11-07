import type { MenuCategoryRecord } from "@/types/menu";

export function filterMenuCategories(
  categories: MenuCategoryRecord[],
  search: string,
  tagId: string | null,
): MenuCategoryRecord[] {
  const terms = search.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);

  if (terms.length === 0 && !tagId) {
    return categories;
  }

  return categories
    .map((category) => ({
      ...category,
      items: category.items.filter((item) => {
        const text = [item.name, item.description, category.name]
          .filter(Boolean).join(" ").toLocaleLowerCase();

        return terms.every((term) => text.includes(term)) &&
          (!tagId || item.tags?.some((tag) => tag.id === tagId));
      }),
    }))
    .filter((category) => category.items.length > 0);
}
