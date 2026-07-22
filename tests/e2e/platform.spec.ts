import { expect, test } from "@playwright/test";

import { loginAsPlatformOwner, optionalEnv } from "./helpers";
import { updateCompanySubscriptionSchema } from "../../lib/validations/tenant-admin";

const liveBaseUrl = optionalEnv("PLAYWRIGHT_BASE_URL");
const platformCredentialsConfigured = Boolean(
  optionalEnv("E2E_PLATFORM_USERNAME") &&
    optionalEnv("E2E_PLATFORM_PASSWORD"),
);

test.describe("platform login", () => {
  test("shows an error for invalid staff credentials", async ({ page }) => {
    test.skip(
      !liveBaseUrl,
      "Set PLAYWRIGHT_BASE_URL to run deployed platform browser tests.",
    );

    await page.goto("/staff/login");
    await page.getByLabel("Username").fill("not-a-real-user");
    await page.getByLabel("Password").fill("not-a-real-password");
    await page.getByRole("button", { name: /sign in/i }).click();

    await expect(page.getByText("Invalid username or password.")).toBeVisible();
  });

  test("logs in as the SaaS owner", async ({ page }) => {
    test.skip(
      !liveBaseUrl || !platformCredentialsConfigured,
      "Set PLAYWRIGHT_BASE_URL and platform E2E credentials to run this test.",
    );

    await loginAsPlatformOwner(page);

    await expect(page).toHaveURL((url) => url.pathname === "/platform");
    await expect(page.getByRole("heading", { name: /platform/i })).toBeVisible();
  });
});

test.describe("platform company forms", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(
      !liveBaseUrl || !platformCredentialsConfigured,
      "Set PLAYWRIGHT_BASE_URL and platform E2E credentials to run platform form tests.",
    );

    await loginAsPlatformOwner(page);
  });

  test("shows inline validation when company name is missing", async ({ page }) => {
    await page.goto("/platform/companies/new");
    await page.getByRole("button", { name: /create company/i }).click();

    await expect(page.locator("#company-name-error")).toBeVisible();
    await expect(page.locator("input").first()).toHaveAttribute("aria-invalid", "true");
  });

  test("creates a company when mutation tests are enabled", async ({ page }) => {
    test.skip(
      process.env.E2E_RUN_MUTATIONS !== "1",
      "Set E2E_RUN_MUTATIONS=1 to allow this test to create staging data.",
    );

    const companyName = `E2E Company ${Date.now()}`;

    await page.goto("/platform/companies/new");
    await page.locator("input").first().fill(companyName);
    await page.getByRole("button", { name: /create company/i }).click();

    await expect(page).toHaveURL(
      (url) => url.pathname === "/platform/companies",
      { timeout: 15000 },
    );
    await expect(
      page.getByRole("heading", { name: /^parent companies$/i }),
    ).toBeVisible();
    await expect(page.getByText("Loading companies...")).toBeHidden({ timeout: 15000 });
    await expect(page.getByText(companyName, { exact: true })).toBeVisible({
      timeout: 15000,
    });
  });
});

test.describe("platform subscription validation", () => {
  test("accepts a plan and commercial status together", () => {
    const result = updateCompanySubscriptionSchema.safeParse({
      planSlug: "growth",
      status: "ACTIVE",
    });

    expect(result.success).toBe(true);
  });

  test("requires a plan when changing subscription settings", () => {
    const result = updateCompanySubscriptionSchema.safeParse({
      planSlug: "",
      status: "ACTIVE",
    });

    expect(result.success).toBe(false);
  });
});
