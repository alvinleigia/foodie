import { expect, type Page } from "@playwright/test";

export function requireEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required for this Playwright test.`);
  }

  return value;
}

export async function loginAsPlatformOwner(page: Page) {
  await page.goto("/staff/login");
  await page.getByLabel("Username").fill(requireEnv("E2E_PLATFORM_USERNAME"));
  await page.getByLabel("Password").fill(requireEnv("E2E_PLATFORM_PASSWORD"));
  await page.getByRole("button", { name: /sign in/i }).click();

  await expect(page).toHaveURL(/\/platform/);
  await expect(page.getByText("Foodie POS")).toBeVisible();
}

export async function loginWithStaffCredentials(
  page: Page,
  usernameEnv: string,
  passwordEnv: string,
) {
  await page.goto("/staff/login");
  await page.getByLabel("Username").fill(requireEnv(usernameEnv));
  await page.getByLabel("Password").fill(requireEnv(passwordEnv));
  await page.getByRole("button", { name: /sign in/i }).click();

  await expect(page.getByText("Foodie POS")).toBeVisible();
}
