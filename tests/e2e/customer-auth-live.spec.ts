import { expect, test, type Page } from "@playwright/test";

import {
  activateAccessContext,
  loginWithStaffCredentials,
  optionalEnv,
  pathForBaseUrl,
} from "./helpers";

function getCustomerAuthConfig() {
  const usernameEnv = optionalEnv("E2E_CUSTOMER_AUTH_USERNAME")
    ? "E2E_CUSTOMER_AUTH_USERNAME"
    : optionalEnv("E2E_ROUTING_USERNAME")
      ? "E2E_ROUTING_USERNAME"
      : "E2E_ISOLATION_USERNAME";
  const passwordEnv = optionalEnv("E2E_CUSTOMER_AUTH_PASSWORD")
    ? "E2E_CUSTOMER_AUTH_PASSWORD"
    : optionalEnv("E2E_ROUTING_PASSWORD")
      ? "E2E_ROUTING_PASSWORD"
      : "E2E_ISOLATION_PASSWORD";

  return {
    adminBaseUrl:
      optionalEnv("E2E_CUSTOMER_AUTH_ADMIN_BASE_URL") ??
      optionalEnv("E2E_ROUTING_ADMIN_BASE_URL") ??
      optionalEnv("E2E_ISOLATION_BASE_URL") ??
      optionalEnv("PLAYWRIGHT_BASE_URL"),
    context:
      optionalEnv("E2E_CUSTOMER_AUTH_CONTEXT") ??
      optionalEnv("E2E_ROUTING_CONTEXT") ??
      optionalEnv("E2E_ISOLATION_FIRST_CONTEXT"),
    customerBaseUrl:
      optionalEnv("E2E_CUSTOMER_AUTH_BASE_URL") ??
      optionalEnv("E2E_ROUTING_CUSTOMER_BASE_URL"),
    email: optionalEnv("E2E_CUSTOMER_AUTH_EMAIL"),
    otpCode: optionalEnv("E2E_CUSTOMER_AUTH_OTP_CODE"),
    password: optionalEnv(passwordEnv),
    passwordEnv,
    routeSlug: optionalEnv("E2E_CUSTOMER_AUTH_ROUTE_SLUG"),
    username: optionalEnv(usernameEnv),
    usernameEnv,
  };
}

type CustomerAuthConfig = ReturnType<typeof getCustomerAuthConfig> & {
  adminBaseUrl: string;
  customerBaseUrl: string;
  username: string;
  password: string;
};

function skipUnlessCustomerAuthConfigured() {
  const config = getCustomerAuthConfig();

  test.skip(
    !config.adminBaseUrl ||
      !config.customerBaseUrl ||
      !config.username ||
      !config.password,
    "Set the customer-auth or routing administration URL, white-label URL and manager credentials.",
  );

  return config as CustomerAuthConfig;
}

async function resolveRestaurantSlug(page: Page, config: CustomerAuthConfig) {
  if (config.routeSlug) {
    return config.routeSlug;
  }

  await loginWithStaffCredentials(
    page,
    config.usernameEnv,
    config.passwordEnv,
    config.adminBaseUrl,
  );

  if (config.context) {
    await activateAccessContext(page, config.adminBaseUrl, config.context);
  }

  const tenantResponse = await page.request.get(
    pathForBaseUrl(config.adminBaseUrl, "/api/tenant/admin"),
  );
  expect(tenantResponse.ok()).toBeTruthy();

  const tenant = (await tenantResponse.json()) as {
    organization: { slug: string };
  };

  return tenant.organization.slug;
}

function getCustomerLoginUrl(config: CustomerAuthConfig, routeSlug: string) {
  const loginUrl = new URL("/customer/login", config.customerBaseUrl);
  loginUrl.searchParams.set("route", routeSlug);
  loginUrl.searchParams.set("returnTo", `/order/status/${routeSlug}`);
  return loginUrl;
}

async function openCustomerLogin(page: Page, config: CustomerAuthConfig) {
  const routeSlug = await resolveRestaurantSlug(page, config);
  const loginUrl = getCustomerLoginUrl(config, routeSlug);

  await page.goto(loginUrl.toString());
  expect(new URL(page.url()).origin).toBe(new URL(config.customerBaseUrl).origin);

  return { loginUrl, routeSlug };
}

test.describe.serial("live white-label customer authentication", () => {
  test("offers email OTP and Google sign-in on the customer domain", async ({
    page,
  }) => {
    const config = skipUnlessCustomerAuthConfigured();
    await openCustomerLogin(page, config);

    await expect(page.getByLabel("Email address")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Google", exact: true }),
    ).toBeVisible();
  });

  test("requests a real email OTP from the customer domain", async ({ page }) => {
    const config = skipUnlessCustomerAuthConfigured();

    test.skip(
      !config.email || Boolean(config.otpCode),
      "Set E2E_CUSTOMER_AUTH_EMAIL without E2E_CUSTOMER_AUTH_OTP_CODE to request a fresh code.",
    );

    await openCustomerLogin(page, config);
    await page.getByLabel("Email address").fill(config.email!);
    await page.getByRole("button", { name: /email me a code/i }).click();

    await expect(page.getByLabel("Six-digit code")).toBeVisible();
    await expect(page.getByText(`Enter the code sent to ${config.email}.`)).toBeVisible();
  });

  test("completes an existing email OTP on the customer domain", async ({ page }) => {
    const config = skipUnlessCustomerAuthConfigured();

    test.skip(
      !config.email || !config.otpCode,
      "Set E2E_CUSTOMER_AUTH_EMAIL and the latest E2E_CUSTOMER_AUTH_OTP_CODE to verify the code.",
    );

    await page.route("**/api/customer/auth/request-code**", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        json: {
          expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
          message: "Existing test code retained.",
        },
        status: 200,
      });
    });

    await openCustomerLogin(page, config);
    await page.getByLabel("Email address").fill(config.email!);
    await page.getByRole("button", { name: /email me a code/i }).click();
    await page.getByLabel("Six-digit code").fill(config.otpCode!);
    await page.getByRole("button", { name: /verify code/i }).click();

    await expect
      .poll(async () => {
        const response = await page.request.get(
          pathForBaseUrl(config.customerBaseUrl, "/api/auth/session"),
        );

        if (!response.ok()) {
          return null;
        }

        const session = (await response.json()) as {
          user?: { email?: string; kind?: string };
        } | null;

        return session?.user ?? null;
      }, { timeout: 20_000 })
      .toMatchObject({
        email: config.email,
        kind: "customer",
      });
  });

  test("starts Google OAuth through the central platform", async ({ page }) => {
    const config = skipUnlessCustomerAuthConfigured();
    await openCustomerLogin(page, config);

    await page.getByRole("button", { name: "Google", exact: true }).click();
    await page.waitForURL(
      (url) => url.hostname === "accounts.google.com",
      { timeout: 30_000 },
    );
  });
});
