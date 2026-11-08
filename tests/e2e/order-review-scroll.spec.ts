import { expect, test } from "@playwright/test";

const menuUrl = process.env.E2E_ORDER_MENU_URL;

test.describe("order review scroll position", () => {
  test.skip(!menuUrl, "Set E2E_ORDER_MENU_URL to a public restaurant menu.");

  for (const width of [440, 1440]) {
    test(`opens review at the top after ordering from a late category at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 956 });
      await page.route("**/api/orders", (route) => route.abort());
      await page.goto(menuUrl!);
      const categories = page.locator('section[id^="menu-category-"]');
      await expect(categories.last()).toBeVisible();
      await categories.last().getByRole("button", { name: "Add", exact: true }).last().click();
      expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(500);
      await page.getByRole("button", { name: "View Cart", exact: true }).click();
      const cart = page.getByRole("dialog", { name: "Your cart" });
      await cart.getByRole("button", { name: "Review Order", exact: true }).click();

      const heading = page.getByRole("heading", { name: "Review and pay", exact: true });
      await expect(heading).toBeInViewport();
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
      await expect(cart).toHaveCount(0);
      await expect(page.locator('[data-slot="card-header"]').filter({ has: heading })).toBeFocused();
      await page.waitForTimeout(400);
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
      await expect(page.getByText("Order summary", { exact: true })).toBeVisible();
      await page.screenshot({ path: test.info().outputPath("review-top.png") });
    });

    test(`closing the cart preserves the menu position at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 956 });
      await page.goto(menuUrl!);
      await page.locator('section[id^="menu-category-"]').last()
        .getByRole("button", { name: "Add", exact: true }).last().click();
      const position = await page.evaluate(() => window.scrollY);
      expect(position).toBeGreaterThan(500);
      await page.getByRole("button", { name: "View Cart", exact: true }).click();
      await page.getByRole("dialog", { name: "Your cart" }).getByRole("button", { name: "Close", exact: true }).click();
      await expect(page.getByRole("dialog", { name: "Your cart" })).toHaveCount(0);
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(position);
    });
  }
});
