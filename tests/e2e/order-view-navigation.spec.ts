import { expect, test, type Page } from "@playwright/test";

const menuUrl = process.env.E2E_ORDER_MENU_URL;
const staffUrl = process.env.E2E_ORDER_NAV_STAFF_URL;

async function back(page: Page) {
  await page.evaluate(() => window.history.back());
}

async function forward(page: Page) {
  await page.evaluate(() => window.history.forward());
}

async function addPlainItem(page: Page) {
  const row = page.locator('[data-slot="menu-item-row"]').filter({
    has: page.getByRole("button", { name: "Add", exact: true }),
  }).last();
  await row.getByRole("button", { name: "Add", exact: true }).click();
}

test.describe("ordering view navigation", () => {
  test.skip(!menuUrl, "Set E2E_ORDER_MENU_URL to an order menu with plain and customizable items.");

  test.beforeEach(async ({ page }) => {
    await page.route("**/api/orders", (route) => route.abort());
  });

  for (const width of [440, 1440]) {
    test(`browser Back and Forward preserve checkout and cart at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 956 });
      await page.goto(menuUrl!);
      const url = page.url();
      await addPlainItem(page);
      const menuScroll = await page.evaluate(() => window.scrollY);
      await page.getByRole("button", { name: "View Cart", exact: true }).click();
      const cart = page.getByRole("dialog", { name: "Your cart" });
      await cart.getByRole("button", { name: "Review Order", exact: true }).click();
      const review = page.getByRole("heading", { name: "Review and pay", exact: true });
      await expect(review).toBeInViewport();
      await page.getByLabel("Full name", { exact: true }).fill("Demo Customer");
      await page.getByLabel("Email address", { exact: true }).fill("demo@example.com");
      expect(await page.evaluate(() => JSON.stringify(window.history.state))).not.toContain("demo@example.com");

      await back(page);
      await expect(cart).toBeVisible();
      await expect(cart.getByText("1 item(s)", { exact: true })).toBeVisible();
      await back(page);
      await expect(cart).toHaveCount(0);
      await expect(page.getByRole("navigation", { name: "Menu categories" })).toBeVisible();
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(menuScroll);
      await expect(page.locator('[data-slot="route-transition-overlay"]')).toHaveCount(0);

      await forward(page);
      await expect(cart).toBeVisible();
      await forward(page);
      await expect(review).toBeInViewport();
      await expect(page.getByLabel("Full name", { exact: true })).toHaveValue("Demo Customer");
      await expect(page.getByLabel("Email address", { exact: true })).toHaveValue("demo@example.com");
      await expect(page.getByText("Order summary", { exact: true })).toBeVisible();
      await expect(page.locator('[data-slot="route-transition-overlay"]')).toHaveCount(0);
      expect(page.url()).toBe(url);
      await page.screenshot({ path: test.info().outputPath("review-back-control.png") });
    });

    test(`visible Back controls follow history without adding duplicate steps at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 956 });
      await page.goto(menuUrl!);
      await addPlainItem(page);
      await page.getByRole("button", { name: "View Cart", exact: true }).click();
      const cart = page.getByRole("dialog", { name: "Your cart" });
      await cart.getByRole("button", { name: "Review Order", exact: true }).click();
      await page.getByRole("button", { name: "Back to cart", exact: true }).click();
      await expect(cart).toBeVisible();
      await expect(cart.getByRole("button", { name: "Back to menu", exact: true })).toHaveCount(0);
      await cart.getByRole("button", { name: "Close", exact: true }).click();
      await expect(cart).toHaveCount(0);
      await forward(page);
      await expect(cart).toBeVisible();
      await forward(page);
      await expect(page.getByRole("heading", { name: "Review and pay", exact: true })).toBeInViewport();
      await page.getByRole("button", { name: "Back to Menu", exact: true }).click();
      await expect(page.getByRole("navigation", { name: "Menu categories" })).toBeVisible();
      await expect(cart).toHaveCount(0);
      await forward(page);
      await expect(cart).toBeVisible();
    });

    test(`a closed cart can reopen and go Back without leaving the menu at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 956 });
      await page.goto(menuUrl!);
      await addPlainItem(page);
      const url = page.url();
      const cart = page.getByRole("dialog", { name: "Your cart" });
      await page.getByRole("button", { name: "View Cart", exact: true }).click();
      await cart.getByRole("button", { name: "Close", exact: true }).click();
      await expect(cart).toHaveCount(0);
      await page.getByRole("button", { name: "View Cart", exact: true }).click();
      await expect(cart).toBeVisible();
      await back(page);
      await expect(cart).toHaveCount(0);
      await expect(page.getByRole("navigation", { name: "Menu categories" })).toBeVisible();
      expect(page.url()).toBe(url);
    });

    test(`customization Back and Forward keep selected options at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 956 });
      await page.goto(menuUrl!);
      await page.getByRole("button", { name: "Customize", exact: true }).first().click();
      const customization = page.getByRole("dialog", { name: "Customize item" });
      await customization.getByRole("checkbox").first().check();
      await back(page);
      await expect(customization).toHaveCount(0);
      await forward(page);
      await expect(customization).toBeVisible();
      await expect(customization.getByRole("checkbox").first()).toBeChecked();
      await customization.getByRole("button", { name: "Add to Cart", exact: true }).click();
      await expect(customization).toHaveCount(0);
      await page.getByRole("button", { name: "View Cart", exact: true }).click();
      await expect(page.getByRole("dialog", { name: "Your cart" })).toContainText("1 item(s)");
      await expect(page.locator('[data-slot="route-transition-overlay"]')).toHaveCount(0);
    });

    test(`an empty cart cannot be reopened as checkout through Forward at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 956 });
      await page.goto(menuUrl!);
      await addPlainItem(page);
      await page.getByRole("button", { name: "View Cart", exact: true }).click();
      const cart = page.getByRole("dialog", { name: "Your cart" });
      await cart.getByRole("button", { name: "Review Order", exact: true }).click();
      await page.getByRole("button", { name: "Back to cart", exact: true }).click();
      await expect(cart).toBeVisible();
      await cart.getByRole("button", { name: /Remove/ }).click();
      await expect(cart.getByText("Your cart is empty", { exact: true })).toBeVisible();
      await forward(page);
      await expect(page.getByRole("navigation", { name: "Menu categories" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Review and pay", exact: true })).toHaveCount(0);
    });

    test(`Back closes quantity choices and separate customization in order at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 956 });
      await page.goto(menuUrl!);
      const customizableRow = page.locator('[data-slot="menu-item-row"]').filter({
        has: page.getByRole("button", { name: "Customize", exact: true }),
      }).first();
      const name = (await customizableRow.locator("p").first().innerText()).trim();
      const row = page.locator('[data-slot="menu-item-row"]').filter({
        has: page.getByText(name, { exact: true }),
      });
      await customizableRow.getByRole("button", { name: "Customize", exact: true }).click();
      const customization = page.getByRole("dialog", { name: "Customize item" });
      await customization.getByRole("checkbox").first().check();
      await customization.getByRole("button", { name: "Add to Cart", exact: true }).click();
      await row.getByRole("button", { name: `Increase ${name} quantity`, exact: true }).click();
      const choices = page.getByRole("alertdialog");
      await expect(choices).toBeVisible();
      await back(page);
      await expect(choices).toHaveCount(0);
      await forward(page);
      await expect(choices).toBeVisible();
      await choices.getByRole("button", { name: "Customize separately", exact: true }).click();
      await expect(customization).toBeVisible();
      await back(page);
      await expect(customization).toHaveCount(0);
      await expect(choices).toHaveCount(0);
      await expect(row.locator('[data-slot="menu-item-quantity"]')).toContainText("1");
    });
  }

  test("staff Back navigation preserves the customer/table and order", async ({ page }) => {
    test.skip(!staffUrl, "Set E2E_ORDER_NAV_STAFF_URL to an authenticated or isolated staff ordering view.");
    await page.goto(staffUrl!);
    await addPlainItem(page);
    await page.getByRole("button", { name: "View Cart", exact: true }).click();
    const cart = page.getByRole("dialog", { name: "Your cart" });
    await cart.getByRole("button", { name: "Review Order", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Confirm order", exact: true })).toBeInViewport();
    await page.getByPlaceholder("Enter customer name or table number").fill("Table 12");
    await back(page);
    await expect(cart).toBeVisible();
    await forward(page);
    await expect(page.getByRole("heading", { name: "Confirm order", exact: true })).toBeInViewport();
    await expect(page.getByPlaceholder("Enter customer name or table number")).toHaveValue("Table 12");
    await expect(page.getByText("Order summary", { exact: true })).toBeVisible();
  });

  test("Back leaves the menu normally instead of trapping the customer", async ({ page }) => {
    const startUrl = new URL("/navigation-test-start", menuUrl!).toString();
    await page.route(startUrl, (route) => route.fulfill({
      contentType: "text/html", body: `<a href="${menuUrl!}">Open menu</a>`,
    }));
    await page.goto(startUrl);
    await page.getByRole("link", { name: "Open menu" }).click();
    await addPlainItem(page);
    await page.getByRole("button", { name: "View Cart", exact: true }).click();
    await page.getByRole("dialog", { name: "Your cart" }).getByRole("button", { name: "Close", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Your cart" })).toHaveCount(0);
    await back(page);
    await expect(page).toHaveURL(startUrl);
  });

  test("reloading checkout does not reopen an empty review view", async ({ page }) => {
    await page.goto(menuUrl!);
    await addPlainItem(page);
    await page.getByRole("button", { name: "View Cart", exact: true }).click();
    await page.getByRole("dialog", { name: "Your cart" }).getByRole("button", { name: "Review Order", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Review and pay", exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("navigation", { name: "Menu categories" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Review and pay", exact: true })).toHaveCount(0);
  });
});
