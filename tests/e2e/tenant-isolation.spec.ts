import { expect, test } from "@playwright/test";

import {
  activateAccessContext,
  findAccessContext,
  getSessionMemberships,
  loginWithStaffCredentials,
  optionalEnv,
  pathForBaseUrl,
} from "./helpers";

function getIsolationConfig() {
  return {
    baseUrl:
      optionalEnv("E2E_ISOLATION_BASE_URL") ?? optionalEnv("PLAYWRIGHT_BASE_URL"),
    firstContext: optionalEnv("E2E_ISOLATION_FIRST_CONTEXT"),
    secondContext: optionalEnv("E2E_ISOLATION_SECOND_CONTEXT"),
  };
}

type IsolationConfig = {
  baseUrl: string;
  firstContext: string;
  secondContext: string;
};

function skipUnlessIsolationConfigured() {
  const config = getIsolationConfig();

  test.skip(
    !config.baseUrl ||
      !config.firstContext ||
      !config.secondContext ||
      !process.env.E2E_ISOLATION_USERNAME ||
      !process.env.E2E_ISOLATION_PASSWORD,
    "Set E2E_ISOLATION_FIRST_CONTEXT, E2E_ISOLATION_SECOND_CONTEXT, E2E_ISOLATION_USERNAME and E2E_ISOLATION_PASSWORD to run tenant isolation tests.",
  );

  return config as IsolationConfig;
}

test.describe("tenant isolation", () => {
  test("scopes tenant data to the active restaurant membership", async ({ page }) => {
    const config = skipUnlessIsolationConfigured();
    const restaurantSlugs: string[] = [];

    await loginWithStaffCredentials(
      page,
      "E2E_ISOLATION_USERNAME",
      "E2E_ISOLATION_PASSWORD",
      config.baseUrl,
    );

    const payload = await getSessionMemberships(page, config.baseUrl);
    const firstMembership = findAccessContext(payload, config.firstContext);
    const secondMembership = findAccessContext(payload, config.secondContext);

    expect(firstMembership).toBeTruthy();
    expect(secondMembership).toBeTruthy();
    expect(firstMembership?.organizationId).not.toBe(secondMembership?.organizationId);

    for (const [membership, contextName] of [
      [firstMembership, config.firstContext],
      [secondMembership, config.secondContext],
    ] as const) {
      await activateAccessContext(
        page,
        config.baseUrl,
        contextName,
      );

      const response = await page.request.get(
        pathForBaseUrl(config.baseUrl, "/api/tenant/admin"),
      );
      expect(response.ok()).toBeTruthy();

      const snapshot = (await response.json()) as {
        organization: { id: string; slug: string };
      };
      expect(snapshot.organization.id).toBe(membership?.organizationId);
      restaurantSlugs.push(snapshot.organization.slug);

      const orderResponse = await page.request.get(
        pathForBaseUrl(config.baseUrl, "/order"),
      );
      expect(orderResponse.ok()).toBeTruthy();
      expect(new URL(orderResponse.url()).pathname).toBe(
        `/restaurants/${snapshot.organization.slug}/order`,
      );
    }

    const staleMenuResponse = await page.request.get(
      pathForBaseUrl(
        config.baseUrl,
        `/api/menu?staffRestaurant=${encodeURIComponent(restaurantSlugs[0])}`,
      ),
    );
    expect(staleMenuResponse.status()).toBe(409);
  });

  test("rejects switching to an unavailable membership", async ({ page }) => {
    const config = skipUnlessIsolationConfigured();

    await loginWithStaffCredentials(
      page,
      "E2E_ISOLATION_USERNAME",
      "E2E_ISOLATION_PASSWORD",
      config.baseUrl,
    );

    const switchResponse = await page.request.patch(
      pathForBaseUrl(config.baseUrl, "/api/session/memberships"),
      {
        data: { membershipId: "00000000-0000-4000-8000-000000000000" },
      },
    );

    expect(switchResponse.status()).toBe(403);
  });
});
