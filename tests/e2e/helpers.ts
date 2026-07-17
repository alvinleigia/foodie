import { expect, type Page } from "@playwright/test";

export type MembershipOption = {
  membershipId: string;
  role: string;
  organizationId: string;
  organizationName: string;
  organizationType: string;
};

export type MembershipPayload = {
  active: {
    organizationId: string;
    role: string;
  };
  memberships: MembershipOption[];
};

export type MembershipSwitchPayload = {
  active: MembershipPayload["active"];
  redirectTo: string;
};

export function requireEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required for this Playwright test.`);
  }

  return value;
}

export function optionalEnv(name: string) {
  const value = process.env[name]?.trim();

  return value || undefined;
}

export function pathForBaseUrl(baseUrl: string | undefined, path: string) {
  if (!baseUrl) {
    return path;
  }

  return new URL(path, baseUrl).toString();
}

export function getManagerBaseUrl() {
  return optionalEnv("E2E_MANAGER_BASE_URL") ?? optionalEnv("PLAYWRIGHT_BASE_URL");
}

function normalizeContext(value: string) {
  return value
    .replace(/[_-]/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function getMembershipSearchText(membership: MembershipOption) {
  return normalizeContext(
    [
      membership.organizationName,
      membership.role,
    ]
      .filter(Boolean)
      .join(" "),
  );
}

export function hasMatchingContext(searchText: string, contextText: string) {
  const contextTokens = normalizeContext(contextText).split(" ").filter(Boolean);

  return contextTokens.every((token) => searchText.includes(token));
}

export async function getSessionMemberships(page: Page, baseUrl: string | undefined) {
  const response = await page.request.get(pathForBaseUrl(baseUrl, "/api/session/memberships"));

  expect(response.ok()).toBeTruthy();

  return (await response.json()) as MembershipPayload;
}

export function findAccessContext(payload: MembershipPayload, contextText: string) {
  return payload.memberships.find((option) =>
    hasMatchingContext(getMembershipSearchText(option), contextText),
  );
}

export async function activateAccessContext(
  page: Page,
  baseUrl: string | undefined,
  contextText: string,
) {
  const payload = await getSessionMemberships(page, baseUrl);
  const membership = findAccessContext(payload, contextText);

  if (!membership) {
    const availableContexts = payload.memberships
      .map((option) => getMembershipSearchText(option))
      .join(", ");

    throw new Error(
      `No access context matched "${contextText}". Available contexts: ${availableContexts}`,
    );
  }

  const switchResponse = await page.request.patch(
    pathForBaseUrl(baseUrl, "/api/session/memberships"),
    {
      data: { membershipId: membership.membershipId },
    },
  );

  expect(switchResponse.ok()).toBeTruthy();

  return (await switchResponse.json()) as MembershipSwitchPayload;
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
  baseUrl?: string,
) {
  await page.goto(pathForBaseUrl(baseUrl, "/staff/login"));
  await page.getByLabel("Username").fill(requireEnv(usernameEnv));
  await page.getByLabel("Password").fill(requireEnv(passwordEnv));
  await page.getByRole("button", { name: /sign in/i }).click();

  await expect(page.getByText("Foodie POS")).toBeVisible();
}
