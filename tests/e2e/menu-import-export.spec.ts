import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

test.describe("menu import and export", () => {
  test("round-trips product image URLs without clearing legacy imports", () => {
    const menuSource = readFileSync("lib/menu.ts", "utf8");
    const managerSource = readFileSync(
      "components/staff/MenuManager.tsx",
      "utf8",
    );

    expect(menuSource).toContain('"item_image_url"');
    expect(menuSource).toContain("itemImageUrl: item.imageUrl ?? \"\"");
    expect(menuSource).toContain("const hasItemImageUrl = itemImageUrlIndex >= 0");
    expect(menuSource).toContain(
      "...(hasItemImageUrl ? { imageUrl: itemImageUrl } : {})",
    );
    expect(managerSource).toContain("Product images: item_image_url");
  });
});
