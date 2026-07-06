import { expect, test } from "@playwright/test";

import {
  findAccessContext,
  getSessionMemberships,
  isActiveMembershipInList,
  loginWithStaffCredentials,
  optionalEnv,
  pathForBaseUrl,
} from "./helpers";

function getIsolationConfig() {
  return {
    allowedBaseUrl: optionalEnv("E2E_ISOLATION_ALLOWED_BASE_URL"),
    forbiddenBaseUrl: optionalEnv("E2E_ISOLATION_FORBIDDEN_BASE_URL"),
    allowedContext: optionalEnv("E2E_ISOLATION_ALLOWED_CONTEXT"),
    forbiddenContext: optionalEnv("E2E_ISOLATION_FORBIDDEN_CONTEXT"),
  };
}

type IsolationConfig = {
  allowedBaseUrl: string;
  forbiddenBaseUrl: string;
  allowedContext: string;
  forbiddenContext: string;
};

function skipUnlessIsolationConfigured() {
  const config = getIsolationConfig();

  test.skip(
    !config.allowedBaseUrl ||
      !config.forbiddenBaseUrl ||
      !config.allowedContext ||
      !config.forbiddenContext ||
      !process.env.E2E_ISOLATION_USERNAME ||
      !process.env.E2E_ISOLATION_PASSWORD,
    "Set E2E_ISOLATION_ALLOWED_BASE_URL, E2E_ISOLATION_FORBIDDEN_BASE_URL, E2E_ISOLATION_ALLOWED_CONTEXT, E2E_ISOLATION_FORBIDDEN_CONTEXT, E2E_ISOLATION_USERNAME and E2E_ISOLATION_PASSWORD to run tenant isolation tests.",
  );

  return config as IsolationConfig;
}

test.describe("tenant isolation", () => {
  test("scopes visible memberships to the current tenant domain", async ({ page }) => {
    const config = skipUnlessIsolationConfigured();

    await loginWithStaffCredentials(
      page,
      "E2E_ISOLATION_USERNAME",
      "E2E_ISOLATION_PASSWORD",
      config.allowedBaseUrl,
    );

    const payload = await getSessionMemberships(page, config.allowedBaseUrl);

    expect(findAccessContext(payload, config.allowedContext)).toBeTruthy();
    expect(findAccessContext(payload, config.forbiddenContext)).toBeFalsy();
    expect(isActiveMembershipInList(payload)).toBeTruthy();
  });

  test("rejects switching to a membership from another tenant domain", async ({ page }) => {
    const config = skipUnlessIsolationConfigured();

    await loginWithStaffCredentials(
      page,
      "E2E_ISOLATION_USERNAME",
      "E2E_ISOLATION_PASSWORD",
      config.forbiddenBaseUrl,
    );

    const forbiddenPayload = await getSessionMemberships(page, config.forbiddenBaseUrl);
    const forbiddenMembership = findAccessContext(
      forbiddenPayload,
      config.forbiddenContext,
    );

    expect(forbiddenMembership).toBeTruthy();

    await loginWithStaffCredentials(
      page,
      "E2E_ISOLATION_USERNAME",
      "E2E_ISOLATION_PASSWORD",
      config.allowedBaseUrl,
    );

    const switchResponse = await page.request.patch(
      pathForBaseUrl(config.allowedBaseUrl, "/api/session/memberships"),
      {
        data: { membershipId: forbiddenMembership?.membershipId },
      },
    );

    expect(switchResponse.status()).toBe(403);
  });
});
