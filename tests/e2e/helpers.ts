import { expect, type Page } from "@playwright/test";

type MembershipOption = {
  membershipId: string;
  role: string;
  organizationName: string;
  locationName: string | null;
  locationLabel: string | null;
};

type MembershipPayload = {
  memberships: MembershipOption[];
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
  return optionalEnv("E2E_MANAGER_BASE_URL") ?? optionalEnv("E2E_COMPANY_BASE_URL");
}

function normalizeContext(value: string) {
  return value
    .replace(/[_-]/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function getMembershipSearchText(membership: MembershipOption) {
  return normalizeContext(
    [
      membership.organizationName,
      membership.locationName,
      membership.locationLabel,
      membership.role,
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function hasMatchingContext(searchText: string, contextText: string) {
  const contextTokens = normalizeContext(contextText).split(" ").filter(Boolean);

  return contextTokens.every((token) => searchText.includes(token));
}

export async function activateAccessContext(
  page: Page,
  baseUrl: string | undefined,
  contextText: string,
) {
  const response = await page.request.get(pathForBaseUrl(baseUrl, "/api/session/memberships"));
  const payload = (await response.json()) as MembershipPayload;
  const membership = payload.memberships.find((option) =>
    hasMatchingContext(getMembershipSearchText(option), contextText),
  );

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
