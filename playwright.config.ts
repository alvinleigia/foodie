import { defineConfig, devices } from "@playwright/test";

const testEnvironmentDefaults = {
  APP_ROOT_DOMAIN: "foodie.test",
  DEPLOYMENT_CELL_ID: "test-cell",
  DEPLOYMENT_REGION: "TEST",
  NEXT_PUBLIC_DEFAULT_CURRENCY: "GBP",
  NEXT_PUBLIC_DEFAULT_LOCALE: "en-GB",
  NEXT_PUBLIC_DEFAULT_TIMEZONE: "Europe/London",
};

for (const [name, value] of Object.entries(testEnvironmentDefaults)) {
  process.env[name] ??= value;
}

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: [
    ["list"],
    ["html", { open: "never" }],
  ],
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "on-first-retry",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
