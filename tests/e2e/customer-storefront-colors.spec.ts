import { expect, test, type Locator } from "@playwright/test";

const menuUrl = process.env.E2E_ORDER_MENU_URL;
const fixtureUrl = process.env.E2E_CUSTOMER_THEME_FIXTURE_URL;

async function backgroundPixel(locator: Locator) {
  return locator.evaluate((element) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d")!;
    context.fillStyle = getComputedStyle(element).backgroundColor;
    context.fillRect(0, 0, 1, 1);
    return [...context.getImageData(0, 0, 1, 1).data];
  });
}

async function expectGreen(locator: Locator) {
  await expect(locator).toBeVisible();
  await expect.poll(async () => {
    const [red, green, blue, alpha] = await backgroundPixel(locator);
    return green > red + 30 && green > blue && alpha === 255;
  }).toBe(true);
}

async function expectWhite(locator: Locator) {
  await expect(locator).toBeVisible();
  await expect.poll(() => backgroundPixel(locator)).toEqual([255, 255, 255, 255]);
}

for (const theme of ["light", "dark"]) {
  for (const width of [440, 1440]) {
    test(`customer cart and checkout stay green in ${theme} at ${width}px`, async ({ page }) => {
      test.skip(!menuUrl, "Set E2E_ORDER_MENU_URL to a public restaurant menu.");
      await page.setViewportSize({ width, height: 956 });
      await page.addInitScript((value) => localStorage.setItem("foodie-theme", value), theme);
      await page.route("**/api/orders", (route) => route.abort());
      await page.goto(menuUrl!);
      await expect(page.locator("html")).toHaveClass(new RegExp(theme));
      await expectWhite(page.locator("main"));

      await page.getByRole("button", { name: "Menu", exact: true }).click();
      await expectWhite(page.getByRole("menu"));
      await page.keyboard.press("Escape");

      const rows = page.locator('[data-slot="menu-item-row"]');
      await rows.filter({ has: page.getByRole("button", { name: "Add", exact: true }) })
        .first().getByRole("button", { name: "Add", exact: true }).click();
      await expectGreen(page.getByRole("button", { name: "View Cart", exact: true }));
      await page.getByRole("button", { name: "View Cart", exact: true }).click();
      const cart = page.getByRole("dialog");
      await expectWhite(cart);
      await expectGreen(cart.getByRole("button", { name: "Review Order", exact: true }));
      await page.screenshot({ path: test.info().outputPath("cart.png"), animations: "disabled" });
      await cart.getByRole("button", { name: "Review Order", exact: true }).click();

      await expectGreen(page.getByRole("button", { name: "Guest checkout", exact: true }));
      await expectGreen(page.getByRole("button", { name: "Proceed to Payment", exact: true }));
      await page.getByRole("radio", { name: "Takeaway", exact: true }).check();
      await page.getByRole("button", { name: "Schedule", exact: true }).click();
      await expect(page.getByLabel(/Preferred time|Requested time|Promised time/)).toBeVisible();
      const country = page.getByRole("combobox", { name: "Phone country" });
      if (await country.count()) {
        await country.click();
        await expectWhite(page.getByRole("listbox"));
        await page.keyboard.press("Escape");
      }
      await page.screenshot({ path: test.info().outputPath("checkout.png"), animations: "disabled" });

      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expectGreen(page.getByRole("button", { name: "Sign in", exact: true }));
      const sendCode = page.getByRole("button", { name: /Email me a code|Send.*code/i });
      if (await sendCode.count()) await expectGreen(sendCode.first());
      await page.screenshot({ path: test.info().outputPath("sign-in.png"), animations: "disabled" });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });

    test(`customization actions stay green in ${theme} at ${width}px`, async ({ page }) => {
      test.skip(!menuUrl, "Set E2E_ORDER_MENU_URL to a menu with add-ons.");
      await page.setViewportSize({ width, height: 956 });
      await page.addInitScript((value) => localStorage.setItem("foodie-theme", value), theme);
      await page.goto(menuUrl!);
      await page.getByRole("button", { name: "Customize", exact: true }).first().click();
      const dialog = page.getByRole("dialog");
      await expectWhite(dialog);
      await dialog.getByRole("checkbox").first().click();
      await expectGreen(dialog.getByRole("checkbox").first());
      await expectGreen(dialog.getByRole("button", { name: "Add to Cart", exact: true }));
      await page.screenshot({ path: test.info().outputPath("customization.png"), animations: "disabled" });
    });
  }

  test(`account, order-history and confirmation controls use the palette in ${theme}`, async ({ page }) => {
    test.skip(!fixtureUrl, "Set E2E_CUSTOMER_THEME_FIXTURE_URL for isolated customer component checks.");
    await page.addInitScript((value) => localStorage.setItem("foodie-theme", value), theme);
    await page.route("**/api/orders/status**", (route) => route.fulfill({
      json: { currency: "GBP", orders: [{
        orderId: "qa-order", orderNo: 1, organizationId: "qa", customerToken: "qa-token",
        customerName: "Demo Customer", categoryName: "Small Bites", drinkName: "Test Burger",
        fulfilmentType: "PICKUP", status: "PENDING", paymentStatus: "PAID",
        paymentAmount: "6.00", paymentCurrency: "GBP", itemCount: 1,
        createdAt: "2026-11-08T12:00:00.000Z", items: [],
      }] },
    }));

    await page.goto(`${fixtureUrl}?view=profile`);
    await expectWhite(page.locator("main"));
    await expectGreen(page.getByRole("button", { name: "Save profile", exact: true }));
    await page.getByRole("combobox", { name: "Gender", exact: true }).click();
    await expectWhite(page.getByRole("listbox"));
    await page.keyboard.press("Escape");

    await page.goto(`${fixtureUrl}?view=status`);
    await expectGreen(page.getByRole("tab", { selected: true }));
    await page.getByRole("button", { name: "Cancel order", exact: true }).click();
    const cancellation = page.getByRole("alertdialog");
    await expectWhite(cancellation);
    const [cancelRed, cancelGreen] = await backgroundPixel(cancellation.getByRole("button", { name: "Confirm Cancel", exact: true }));
    expect(cancelRed).toBeGreaterThan(cancelGreen);
    await cancellation.getByRole("button", { name: "Keep Order", exact: true }).click();
    await page.goto(`${fixtureUrl}?view=confirmation`);
    await expectGreen(page.getByRole("link", { name: "View your orders", exact: true }));
    await expectWhite(page.getByRole("button", { name: "Download receipt", exact: true }));
    await page.goto(`${fixtureUrl}?view=account-order`);
    await page.getByRole("button", { name: "Add", exact: true }).first().click();
    await page.getByRole("button", { name: "View Cart", exact: true }).click();
    await page.getByRole("button", { name: "Review Order", exact: true }).click();
    await expectGreen(page.getByRole("button", { name: "Pay online", exact: true }));
    await page.getByRole("button", { name: "Pay at collection", exact: true }).click();
    await expectGreen(page.getByRole("button", { name: "Pay at collection", exact: true }));
    await page.goto(`${fixtureUrl}?view=staff`);
    const [red, green, blue] = await backgroundPixel(page.getByRole("button", { name: "Staff action" }));
    expect(Math.abs(red - green)).toBeLessThan(3);
    expect(Math.abs(green - blue)).toBeLessThan(3);
  });

  test(`bill payment result pages remain light in ${theme}`, async ({ page }) => {
    test.skip(!menuUrl, "Set E2E_ORDER_MENU_URL to select the application origin.");
    await page.addInitScript((value) => localStorage.setItem("foodie-theme", value), theme);
    for (const result of ["success", "cancelled"]) {
      await page.goto(new URL(`/order/bill/payment/${result}`, menuUrl).toString());
      await expectWhite(page.locator("main"));
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await page.screenshot({ path: test.info().outputPath(`payment-${result}.png`) });
    }
  });
}
