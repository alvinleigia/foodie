import { createHash, randomBytes } from "node:crypto";

import { eq } from "drizzle-orm";
import { expect, test } from "@playwright/test";

import { getDb } from "@/db";
import { memberships, passwordResetTokens } from "@/db/schema";

import {
  activateAccessContext,
  getSessionMemberships,
  loginWithStaffCredentials,
  optionalEnv,
  pathForBaseUrl,
} from "./helpers";

function getRevocationConfig() {
  const usernameEnv = optionalEnv("E2E_REVOCATION_USERNAME")
    ? "E2E_REVOCATION_USERNAME"
    : "E2E_ISOLATION_USERNAME";
  const passwordEnv = optionalEnv("E2E_REVOCATION_PASSWORD")
    ? "E2E_REVOCATION_PASSWORD"
    : "E2E_ISOLATION_PASSWORD";

  return {
    baseUrl:
      optionalEnv("E2E_REVOCATION_BASE_URL") ??
      optionalEnv("E2E_ISOLATION_BASE_URL") ??
      optionalEnv("PLAYWRIGHT_BASE_URL"),
    context:
      optionalEnv("E2E_REVOCATION_CONTEXT") ??
      optionalEnv("E2E_ISOLATION_FIRST_CONTEXT"),
    databaseUrl: optionalEnv("E2E_DATABASE_URL"),
    usernameEnv,
    passwordEnv,
    username: optionalEnv(usernameEnv),
    password: optionalEnv(passwordEnv),
  };
}

type RevocationConfig = ReturnType<typeof getRevocationConfig> & {
  baseUrl: string;
  databaseUrl: string;
  username: string;
  password: string;
};

function skipUnlessRevocationConfigured() {
  const config = getRevocationConfig();

  test.skip(
    !config.baseUrl ||
      !config.databaseUrl ||
      !config.username ||
      !config.password,
    "Set E2E_DATABASE_URL plus the revocation or isolation URL and credentials to run live session revocation tests.",
  );

  return config as RevocationConfig;
}

async function loginAndGetActiveMembership(
  page: Parameters<typeof loginWithStaffCredentials>[0],
  config: RevocationConfig,
) {
  await loginWithStaffCredentials(
    page,
    config.usernameEnv,
    config.passwordEnv,
    config.baseUrl,
  );

  if (config.context) {
    await activateAccessContext(page, config.baseUrl, config.context);
  }

  const payload = await getSessionMemberships(page, config.baseUrl);
  const activeMembership = payload.memberships.find(
    (membership) =>
      membership.organizationId === payload.active.organizationId &&
      membership.role === payload.active.role,
  );

  expect(activeMembership).toBeTruthy();
  return activeMembership!;
}

test.describe.serial("live staff session revocation", () => {
  test.beforeAll(() => {
    const databaseUrl = optionalEnv("E2E_DATABASE_URL");
    if (databaseUrl) {
      process.env.DATABASE_URL = databaseUrl;
    }
  });

  test("rejects an existing session after its membership is disabled", async ({
    page,
  }) => {
    const config = skipUnlessRevocationConfigured();
    const membership = await loginAndGetActiveMembership(page, config);
    const db = getDb();

    try {
      const [disabledMembership] = await db
        .update(memberships)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(memberships.id, membership.membershipId))
        .returning({ id: memberships.id });

      expect(disabledMembership?.id).toBe(membership.membershipId);

      const response = await page.request.get(
        pathForBaseUrl(config.baseUrl, "/api/session/memberships"),
      );
      expect(response.status()).toBe(401);
    } finally {
      await db
        .update(memberships)
        .set({ isActive: true, updatedAt: new Date() })
        .where(eq(memberships.id, membership.membershipId));
    }
  });

  test("rejects an existing session after a password reset", async ({
    browser,
    page,
  }) => {
    const config = skipUnlessRevocationConfigured();
    const membership = await loginAndGetActiveMembership(page, config);
    const db = getDb();
    const [membershipRecord] = await db
      .select({ userId: memberships.userId })
      .from(memberships)
      .where(eq(memberships.id, membership.membershipId))
      .limit(1);

    expect(membershipRecord?.userId).toBeTruthy();

    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const [resetToken] = await db
      .insert(passwordResetTokens)
      .values({
        userId: membershipRecord!.userId,
        requestedByUserId: membershipRecord!.userId,
        tokenHash,
        expiresAt: new Date(Date.now() + 10 * 60_000),
      })
      .returning({ id: passwordResetTokens.id });

    try {
      const resetResponse = await page.request.post(
        pathForBaseUrl(config.baseUrl, "/api/password-reset"),
        {
          data: { token, password: config.password },
        },
      );
      expect(resetResponse.ok()).toBeTruthy();

      const staleSessionResponse = await page.request.get(
        pathForBaseUrl(config.baseUrl, "/api/session/memberships"),
      );
      expect(staleSessionResponse.status()).toBe(401);

      const freshContext = await browser.newContext();
      try {
        const freshPage = await freshContext.newPage();
        await loginWithStaffCredentials(
          freshPage,
          config.usernameEnv,
          config.passwordEnv,
          config.baseUrl,
        );
      } finally {
        await freshContext.close();
      }
    } finally {
      await db
        .delete(passwordResetTokens)
        .where(eq(passwordResetTokens.id, resetToken.id));
    }
  });
});
