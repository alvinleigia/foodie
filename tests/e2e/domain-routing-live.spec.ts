import { expect, test } from "@playwright/test";

import {
  activateAccessContext,
  loginWithStaffCredentials,
  optionalEnv,
  pathForBaseUrl,
} from "./helpers";

function getRoutingConfig() {
  const usernameEnv = optionalEnv("E2E_ROUTING_USERNAME")
    ? "E2E_ROUTING_USERNAME"
    : "E2E_ISOLATION_USERNAME";
  const passwordEnv = optionalEnv("E2E_ROUTING_PASSWORD")
    ? "E2E_ROUTING_PASSWORD"
    : "E2E_ISOLATION_PASSWORD";

  return {
    adminBaseUrl:
      optionalEnv("E2E_ROUTING_ADMIN_BASE_URL") ??
      optionalEnv("E2E_ISOLATION_BASE_URL") ??
      optionalEnv("PLAYWRIGHT_BASE_URL"),
    customerBaseUrl: optionalEnv("E2E_ROUTING_CUSTOMER_BASE_URL"),
    context:
      optionalEnv("E2E_ROUTING_CONTEXT") ??
      optionalEnv("E2E_ISOLATION_FIRST_CONTEXT"),
    usernameEnv,
    passwordEnv,
    username: optionalEnv(usernameEnv),
    password: optionalEnv(passwordEnv),
  };
}

type RoutingConfig = ReturnType<typeof getRoutingConfig> & {
  adminBaseUrl: string;
  customerBaseUrl: string;
  context: string;
  username: string;
  password: string;
};

function skipUnlessRoutingConfigured() {
  const config = getRoutingConfig();

  test.skip(
    !config.adminBaseUrl ||
      !config.customerBaseUrl ||
      !config.context ||
      !config.username ||
      !config.password,
    "Set E2E_ROUTING_CUSTOMER_BASE_URL plus the routing or isolation administration URL, context and credentials.",
  );

  return config as RoutingConfig;
}

test.describe("live administration and white-label routing", () => {
  test("separates staff routes from customer and ordering-point routes", async ({
    page,
  }) => {
    const config = skipUnlessRoutingConfigured();
    const adminOrigin = new URL(config.adminBaseUrl).origin;
    const customerOrigin = new URL(config.customerBaseUrl).origin;

    expect(customerOrigin).not.toBe(adminOrigin);

    await loginWithStaffCredentials(
      page,
      config.usernameEnv,
      config.passwordEnv,
      config.adminBaseUrl,
    );
    await activateAccessContext(page, config.adminBaseUrl, config.context);

    const tenantResponse = await page.request.get(
      pathForBaseUrl(config.adminBaseUrl, "/api/tenant/admin"),
    );
    expect(tenantResponse.ok()).toBeTruthy();

    const tenant = (await tenantResponse.json()) as {
      organization: { slug: string };
      orderingPoint: { qrSlug: string | null } | null;
    };
    const restaurantSlug = tenant.organization.slug;
    const qrSlug = tenant.orderingPoint?.qrSlug;

    expect(
      qrSlug,
      "Configure a QR slug in Restaurant Setup before running the ordering-point routing gate.",
    ).toBeTruthy();

    const administrationPaths = [
      "/staff/login",
      "/platform",
      "/companies/routing-probe",
      `/restaurants/${restaurantSlug}/orders`,
      `/restaurants/${restaurantSlug}/ordering-point`,
      "/api/customer-social-auth/callback/google",
    ];

    for (const path of administrationPaths) {
      const response = await page.request.get(
        pathForBaseUrl(config.customerBaseUrl, path),
        { maxRedirects: 0 },
      );
      expect([307, 308], `${path} must redirect`).toContain(response.status());

      const location = response.headers()["location"];
      expect(location, `${path} must provide a redirect location`).toBeTruthy();
      expect(new URL(location!, customerOrigin).origin).toBe(adminOrigin);
      expect(new URL(location!, customerOrigin).pathname).toBe(
        new URL(path, adminOrigin).pathname,
      );
    }

    const customerPaths = [
      `/order/${restaurantSlug}`,
      `/order?qr=${encodeURIComponent(qrSlug!)}`,
      `/customer/login?route=${encodeURIComponent(restaurantSlug)}`,
      `/privacy?route=${encodeURIComponent(restaurantSlug)}`,
    ];

    for (const path of customerPaths) {
      const response = await page.request.get(
        pathForBaseUrl(config.customerBaseUrl, path),
        { maxRedirects: 0 },
      );
      expect(response.status(), `${path} must be available`).toBe(200);
      expect(new URL(response.url()).origin).toBe(customerOrigin);
    }
  });
});
