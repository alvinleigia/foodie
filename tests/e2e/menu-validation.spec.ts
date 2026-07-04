import { expect, test } from "@playwright/test";

import { loginWithStaffCredentials } from "./helpers";

test.describe("menu manager validation", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(
      !process.env.E2E_MANAGER_USERNAME || !process.env.E2E_MANAGER_PASSWORD,
      "Set E2E_MANAGER_USERNAME and E2E_MANAGER_PASSWORD to run menu manager tests.",
    );

    await loginWithStaffCredentials(page, "E2E_MANAGER_USERNAME", "E2E_MANAGER_PASSWORD");
  });

  test("shows add-on group validation next to the invalid field", async ({ page }) => {
    await page.goto("/operations/menu");
    await page.getByRole("button", { name: /add add-on group/i }).click();

    await page.getByLabel("Group name").fill("E2E Validation Group");
    await page.getByLabel("Minimum selections").fill("5");
    await page.getByLabel("Maximum selections").fill("0");
    await page.getByRole("button", { name: /^add group$/i }).click();

    await expect(page.locator("#modifier-group-max-selections-error")).toHaveText(
      "Maximum selections cannot be lower than minimum selections.",
    );
  });
});
