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
      const scrollbar = await navigation.evaluate((element) => {
        const bar = getComputedStyle(element, "::-webkit-scrollbar");
        const track = getComputedStyle(element, "::-webkit-scrollbar-track");
        const thumb = getComputedStyle(element, "::-webkit-scrollbar-thumb");
        return { height: bar.height, trackInset: track.marginInlineStart, radius: thumb.borderRadius };
      });
      expect(scrollbar).toEqual({ height: "4px", trackInset: "4px", radius: "999px" });
      const navigationBounds = await navigation.boundingBox();
      const searchBounds = await page.getByRole("searchbox", { name: "Search menu" }).boundingBox();
      expect(navigationBounds!.x).toBeGreaterThanOrEqual(searchBounds!.x);
      expect(navigationBounds!.x + navigationBounds!.width).toBeLessThanOrEqual(searchBounds!.x + searchBounds!.width + 1);
      const container = page.locator('[data-slot="category-navigation-container"]');
      async function expectPaddedNavigation() {
        const outer = await container.boundingBox();
        const inner = await navigation.boundingBox();
        expect(outer).not.toBeNull();
        expect(inner).not.toBeNull();
        expect(Math.round(inner!.x - outer!.x)).toBe(16);
        expect(Math.round(outer!.x + outer!.width - inner!.x - inner!.width)).toBe(16);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        if (viewport.width < 640) {
          expect(Math.round(outer!.x)).toBe(0);
          expect(Math.round(outer!.width)).toBe(viewport.width);
        }
      }
      await expectPaddedNavigation();
      const categoryCount = await categories.count();
      expect(categoryCount).toBeGreaterThan(2);
      await expect(page.getByText(/Food allergy\? Contact the restaurant/)).toHaveCount(0);

      // Jump into a long late category without touching the tab strip.
      await categories.last().evaluate((section) => {
        window.scrollTo(0, section.getBoundingClientRect().top + window.scrollY - 100);
      });
      await expect(buttons.last()).toHaveAttribute("aria-pressed", "true");
      await expectPaddedNavigation();
      await expect.poll(async () => Math.round((await container.boundingBox())!.y)).toBe(0);
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
      await expect(page.getByText("Filter by tag", { exact: true })).toHaveCount(0);
      const initialCount = await rows.count();
      const heading = page.getByRole("heading", { level: 1 });
      await expect(heading).not.toHaveText("Menu");
      const banner = page.locator('img[src*="customer-restaurant-banner"]');
      await expect(banner).toBeVisible();
      await expect.poll(() => banner.evaluate((image) =>
        image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0,
      )).toBe(true);
      const header = page.locator("header").first();
      expect(await header.evaluate((element) => getComputedStyle(element).boxShadow)).toBe("none");
      expect(await header.evaluate((element) => getComputedStyle(element).borderBottomWidth)).toBe("0px");
      const bannerBounds = await banner.boundingBox();
      const searchBounds = await search.boundingBox();
      expect(bannerBounds).not.toBeNull();
      expect(searchBounds).not.toBeNull();
      expect(Math.abs(bannerBounds!.x - searchBounds!.x)).toBeLessThan(2);
      const location = page.locator('[data-slot="restaurant-location"]');
      const fulfilment = page.locator('[data-slot="restaurant-fulfilment"]');
      await expect(location).toBeVisible();
      await expect(fulfilment).toBeVisible();
      const locationBounds = await location.boundingBox();
      const fulfilmentBounds = await fulfilment.boundingBox();
      expect(Math.abs(locationBounds!.y - fulfilmentBounds!.y)).toBeLessThan(2);
      const metadataStyles = await page.locator('[data-slot="restaurant-meta"]').evaluate((element) =>
        [...element.querySelectorAll("p")].map((item) => ({
          fontSize: getComputedStyle(item).fontSize,
          color: getComputedStyle(item).color,
          iconSize: item.querySelector("svg")!.getBoundingClientRect().width,
        })),
      );
      expect(metadataStyles[0]).toEqual(metadataStyles[1]);
      expect(metadataStyles[0].fontSize).toBe("14px");
      expect(metadataStyles[0].iconSize).toBe(16);
      const navigationBounds = await page.getByRole("navigation", { name: "Menu categories" }).boundingBox();
      expect(navigationBounds).not.toBeNull();
      expect(navigationBounds!.y - searchBounds!.y - searchBounds!.height).toBeLessThan(32);
      expect(await page.evaluate(() =>
        document.documentElement.scrollWidth <= window.innerWidth,
      )).toBe(true);
      const category = page.locator('section[id^="menu-category-"]').first();
      expect(await category.evaluate((element) => getComputedStyle(element).borderRadius)).toBe("0px");
      expect(await category.evaluate((element) => getComputedStyle(element).borderTopWidth)).toBe("0px");
      const categoryTitle = await category.getByRole("heading", { level: 2 }).boundingBox();
      const categoryCount = await category.getByText(/^\d+ options$/).boundingBox();
      expect(categoryCount!.x).toBeGreaterThan(categoryTitle!.x + categoryTitle!.width);
      await page.screenshot({ path: test.info().outputPath("restaurant-header.png") });

      const item = rows.filter({
        has: page.getByRole("button", { name: "Add", exact: true }),
      }).first();
      const itemName = (await item.locator("p").first().innerText()).trim();
      await expect(item.locator('[data-slot="menu-item-price"]')).not.toContainText("GBP");
      await expect(item.locator('[data-slot="menu-item-price"]')).toContainText(/[^\d\s.,]/);
      const priceBounds = await item.locator('[data-slot="menu-item-price"]').boundingBox();
      const actionBounds = await item.getByRole("button", { name: "Add", exact: true }).boundingBox();
      expect(actionBounds!.x).toBeGreaterThan(priceBounds!.x + priceBounds!.width);
      expect(Math.abs((actionBounds!.y + actionBounds!.height / 2) - (priceBounds!.y + priceBounds!.height / 2))).toBeLessThan(8);
      await item.getByRole("button", { name: "Add", exact: true }).click();
      await expect(page.getByRole("button", { name: "View Cart" })).toBeVisible();

      const selectedItem = rows.filter({ has: page.getByText(itemName, { exact: true }) });
      await expect(selectedItem).toHaveAttribute("data-selected", "true");
      const selectedStyle = await selectedItem.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          borders: [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth],
          colors: [style.borderTopColor, style.borderRightColor, style.borderBottomColor, style.borderLeftColor],
          radius: style.borderRadius,
          shadow: style.boxShadow,
          background: style.backgroundColor,
        };
      });
      expect(selectedStyle.borders).toEqual(["1px", "1px", "1px", "1px"]);
      expect(new Set(selectedStyle.colors).size).toBe(1);
      expect(selectedStyle.radius).toBe("8px");
      expect(selectedStyle.shadow).toBe("none");
      expect(selectedStyle.background).not.toBe("rgb(255, 255, 255)");
      await expect(selectedItem.locator('[data-slot="menu-item-selected-badge"]')).toHaveClass(/bg-emerald-700/);
      expect(await selectedItem.locator('[data-slot="menu-item-quantity"]').evaluate((element) =>
        getComputedStyle(element).backgroundColor,
      )).toBe("rgb(255, 255, 255)");
      await selectedItem.screenshot({ path: test.info().outputPath("selected-item.png") });
      await selectedItem.getByRole("button", { name: `Reduce ${itemName} quantity`, exact: true }).click();
      await expect(selectedItem).not.toHaveAttribute("data-selected", "true");
      await selectedItem.getByRole("button", { name: "Add", exact: true }).click();

      await search.fill(`  ${itemName.toUpperCase()}  `);
      await expect(rows.first()).toContainText(itemName);
      await expect(selectedItem).toHaveCSS("border-bottom-width", "1px");
      await expect.poll(() => rows.count()).toBeLessThan(initialCount);
      await expect(page.getByRole("button", { name: "View Cart" })).toBeVisible();

      await search.fill("no-such-item-924781");
      await expect(page.getByText("No matching menu items", { exact: true })).toBeVisible();
      await expect(rows).toHaveCount(0);
      await expect(page.getByRole("button", { name: "View Cart" })).toBeVisible();
      await page.getByRole("button", { name: "Clear search" }).click();
      await expect(search).toHaveValue("");
      await expect(rows).toHaveCount(initialCount);
      await expect(page.getByRole("navigation", { name: "Menu categories" })).toBeVisible();
      await expect(rows.filter({ hasText: itemName }).first()).toContainText("In cart");
    });

    test(`keeps More inline and expands descriptions at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto(menuUrl!);
      const rows = page.locator('[data-slot="menu-item-row"]');
      await expect(rows.first()).toBeVisible();
      const moreButtons = page.getByRole("button", { name: /^More about / });
      await page.evaluate(() => document.fonts.ready);
      if (viewport.width >= 640 && await moreButtons.count() === 0) {
        const descriptions = page.locator('[data-slot="menu-item-description"]');
        await expect(descriptions.first()).toBeVisible();
        expect(await descriptions.evaluateAll((elements) => elements.every((element) =>
          element.getBoundingClientRect().height <= Number.parseFloat(getComputedStyle(element).lineHeight) + 1,
        ))).toBe(true);
        await page.setViewportSize({ width: 800, height: viewport.height });
      }
      await expect(moreButtons.first()).toBeVisible();
      const itemName = (await moreButtons.first().getAttribute("aria-label"))!.slice("More about ".length);
      const row = rows.filter({ has: page.getByText(itemName, { exact: true }) });
      const description = row.locator('[data-slot="menu-item-description"]');
      const more = row.getByRole("button", { name: /^More about / });

      async function checkInlinePosition() {
        await expect(more).toHaveAttribute("aria-expanded", "false");
        const metrics = await more.evaluate((button) => {
          const suffix = button.parentElement!;
          const ellipsis = document.createRange();
          ellipsis.setStart(suffix.firstChild!, 0);
          ellipsis.setEnd(suffix.firstChild!, 1);
          const ellipsisBounds = ellipsis.getBoundingClientRect();
          const buttonBounds = button.getBoundingClientRect();
          const paragraph = suffix.parentElement!;
          return {
            gap: buttonBounds.left - ellipsisBounds.right,
            lineDifference: Math.abs(buttonBounds.top - ellipsisBounds.top),
            height: paragraph.getBoundingClientRect().height,
            lineHeight: Number.parseFloat(getComputedStyle(paragraph).lineHeight),
          };
        });
        expect(metrics.gap).toBeGreaterThanOrEqual(0);
        expect(metrics.gap).toBeLessThan(12);
        expect(metrics.lineDifference).toBeLessThan(6);
        expect(metrics.height).toBeLessThanOrEqual(metrics.lineHeight * (page.viewportSize()!.width < 640 ? 2 : 1) + 1);
      }

      await checkInlinePosition();
      const collapsedHeight = (await description.boundingBox())!.height;
      await more.click();
      const less = row.getByRole("button", { name: /^Less about / });
      await expect(less).toHaveAttribute("aria-expanded", "true");
      expect((await description.boundingBox())!.height).toBeGreaterThan(collapsedHeight);
      await less.click();
      await checkInlinePosition();
      await page.setViewportSize({ width: viewport.width < 640 ? 320 : 800, height: viewport.height });
      await expect.poll(async () => (await description.boundingBox())!.height).toBeLessThanOrEqual(49);
      await checkInlinePosition();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await row.screenshot({ path: test.info().outputPath("item-description.png") });
    });

    test(`preserves separate customizations at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto(menuUrl!);
      const rows = page.locator('[data-slot="menu-item-row"]');
      await expect(rows.first()).toBeVisible();
      const customizableRow = rows.filter({ has: page.getByRole("button", { name: "Customize", exact: true }) }).first();
      await expect(customizableRow).toBeVisible();
      const itemName = (await customizableRow.locator("p").first().innerText()).trim();
      const row = rows.filter({ has: page.getByText(itemName, { exact: true }) });
      await row.getByRole("button", { name: "Customize", exact: true }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await dialog.getByRole("checkbox").first().click();
      await dialog.getByRole("button", { name: "Add to Cart", exact: true }).click();
      await row.getByRole("button", { name: `Increase ${itemName} quantity`, exact: true }).click();
      await page.getByRole("button", { name: "Customize separately", exact: true }).click();
      await expect(dialog).toBeVisible();
      await dialog.getByRole("checkbox").nth(1).click();
      await dialog.getByRole("button", { name: "Add to Cart", exact: true }).click();
      await expect(row.locator('[data-slot="menu-item-variant-count"]')).toContainText("2 variants");
      await expect(row.getByRole("button", { name: "Add another", exact: true })).toBeVisible();
      await row.getByRole("button", { name: "Manage variants", exact: true }).click();
      await expect(page.getByRole("button", { name: "Review Order", exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  }
});
