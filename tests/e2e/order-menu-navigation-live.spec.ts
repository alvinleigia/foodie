import { expect, test } from "@playwright/test";

const menuUrl = process.env.E2E_ORDER_MENU_URL;

test.describe("customer menu category navigation", () => {
  test.skip(!menuUrl, "Set E2E_ORDER_MENU_URL to a public menu with multiple categories.");

  for (const viewport of [
    { width: 440, height: 956 },
    { width: 1440, height: 900 },
  ]) {
    test(`keeps the active category visible at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto(menuUrl!);

      const navigation = page.getByRole("navigation", { name: "Menu categories" });
      const categories = page.locator('section[id^="menu-category-"]');
      const buttons = navigation.getByRole("button");
      await expect(navigation).toBeVisible();
      const categoryCount = await categories.count();
      expect(categoryCount).toBeGreaterThan(2);
      await expect(page.getByText(/Food allergy\? Contact the restaurant/)).toHaveCount(0);

      // Jump into a long late category without touching the tab strip.
      await categories.last().evaluate((section) => {
        window.scrollTo(0, section.getBoundingClientRect().top + window.scrollY - 100);
      });
      await expect(buttons.last()).toHaveAttribute("aria-pressed", "true");
      await expect.poll(async () => {
        const bar = await navigation.boundingBox();
        const button = await buttons.last().boundingBox();
        return Boolean(bar && button && button.x >= bar.x &&
          button.x + button.width <= bar.x + bar.width);
      }).toBe(true);
      const scrollPosition = await page.evaluate(() => window.scrollY);
      await page.waitForTimeout(400);
      expect(await page.evaluate(() => window.scrollY)).toBe(scrollPosition);
      await page.screenshot({ path: test.info().outputPath("last-category.png") });

      await categories.first().evaluate((section) => {
        window.scrollTo(0, section.getBoundingClientRect().top + window.scrollY + 200);
      });
      await expect(buttons.first()).toHaveAttribute("aria-pressed", "true");
      await expect.poll(async () => {
        const bar = await navigation.boundingBox();
        const button = await buttons.first().boundingBox();
        return Boolean(bar && button && button.x >= bar.x &&
          button.x + button.width <= bar.x + bar.width);
      }).toBe(true);

      await buttons.nth(1).click();
      await expect(buttons.nth(1)).toHaveAttribute("aria-pressed", "true");
      await expect.poll(async () => {
        const section = await categories.nth(1).boundingBox();
        return section?.y;
      }).toBeGreaterThanOrEqual(0);
      await expect.poll(async () => {
        const section = await categories.nth(1).boundingBox();
        return section?.y;
      }).toBeLessThan(140);
    });

    test(`searches items without losing the cart at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto(menuUrl!);
      const search = page.getByRole("searchbox", { name: "Search menu" });
      const rows = page.locator('[data-slot="menu-item-row"]');
      await expect(rows.first()).toBeVisible();
      const initialCount = await rows.count();
      const heading = page.getByRole("heading", { level: 1 });
      await expect(heading).not.toHaveText("Menu");
      const banner = page.locator('img[src*="customer-restaurant-banner"]');
      await expect(banner).toBeVisible();
      await expect.poll(() => banner.evaluate((image) =>
        image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0,
      )).toBe(true);
      await page.screenshot({ path: test.info().outputPath("restaurant-header.png") });

      const item = rows.filter({
        has: page.getByRole("button", { name: "Add", exact: true }),
      }).first();
      const itemName = (await item.locator("p").first().innerText()).trim();
      await item.getByRole("button", { name: "Add", exact: true }).click();
      await expect(page.getByRole("button", { name: "View Cart" })).toBeVisible();

      await search.fill(`  ${itemName.toUpperCase()}  `);
      await expect(rows.first()).toContainText(itemName);
      await expect.poll(() => rows.count()).toBeLessThan(initialCount);
      await expect(page.getByRole("button", { name: "View Cart" })).toBeVisible();

      await search.fill("no-such-item-924781");
      await expect(page.getByText("No matching menu items", { exact: true })).toBeVisible();
      await expect(rows).toHaveCount(0);
      await expect(page.getByRole("button", { name: "View Cart" })).toBeVisible();
      await page.getByRole("button", { name: "Clear filters" }).click();
      await expect(search).toHaveValue("");
      await expect(rows).toHaveCount(initialCount);
      await expect(page.getByRole("navigation", { name: "Menu categories" })).toBeVisible();
      await expect(rows.filter({ hasText: itemName }).first()).toContainText("In cart");
    });
  }
});
