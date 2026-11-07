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
      await expect(page.getByText(
        "Food allergy? Contact the restaurant before placing your order.",
        { exact: true },
      )).toBeVisible();

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
  }
});
