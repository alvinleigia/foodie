import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

export const customerOAuthContextCookieName = "foodie.customer-oauth-context";
export const customerOAuthContextMaxAgeSeconds = 10 * 60;

export type CustomerOAuthProvider = "apple" | "facebook" | "google";

export type CustomerOAuthContext = {
  destinationOrigin: string;
  expiresAt: number;
  organizationId: string;
  provider: CustomerOAuthProvider;
  returnTo: string;
};

function getSigningSecret() {
  const secret = process.env.AUTH_SECRET;

  if (!secret) {
    throw new Error("AUTH_SECRET is required for customer OAuth context.");
  }

  return secret;
}

function signPayload(payload: string) {
  return createHmac("sha256", getSigningSecret()).update(payload).digest("base64url");
}

function hasValidSignature(payload: string, signature: string) {
  const expected = Buffer.from(signPayload(payload));
  const received = Buffer.from(signature);

  return expected.length === received.length && timingSafeEqual(expected, received);
}

export function createCustomerOAuthContextValue(
  context: Omit<CustomerOAuthContext, "expiresAt">,
) {
  const payload = Buffer.from(
    JSON.stringify({
      ...context,
      expiresAt: Date.now() + customerOAuthContextMaxAgeSeconds * 1000,
    } satisfies CustomerOAuthContext),
  ).toString("base64url");

  return `${payload}.${signPayload(payload)}`;
}

export function parseCustomerOAuthContextValue(value: string | undefined) {
  if (!value) {
    return null;
  }

  const [payload, signature] = value.split(".");

  if (!payload || !signature || !hasValidSignature(payload, signature)) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as Partial<CustomerOAuthContext>;

    if (
      typeof parsed.destinationOrigin !== "string" ||
      typeof parsed.organizationId !== "string" ||
      !["apple", "facebook", "google"].includes(parsed.provider ?? "") ||
      typeof parsed.returnTo !== "string" ||
      !parsed.returnTo.startsWith("/") ||
      typeof parsed.expiresAt !== "number" ||
      parsed.expiresAt <= Date.now()
    ) {
      return null;
    }

    const destination = new URL(parsed.destinationOrigin);

    if (
      !["http:", "https:"].includes(destination.protocol) ||
      destination.origin !== parsed.destinationOrigin ||
      destination.username ||
      destination.password
    ) {
      return null;
    }

    return parsed as CustomerOAuthContext;
  } catch {
    return null;
  }
}

export function getCustomerOAuthContextFromRequest(
  request: NextRequest | undefined,
): CustomerOAuthContext | null {
  return parseCustomerOAuthContextValue(
    request?.cookies.get(customerOAuthContextCookieName)?.value,
  );
}
