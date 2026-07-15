import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";

import { getDb } from "@/db";
import { customerAuthHandoffs, customers } from "@/db/schema";
import { getSafeCustomerReturnTo } from "@/lib/customer-navigation";
import {
  isPlatformAdministrationDomain,
  normalizeDomain,
} from "@/lib/deployment-domain";
import {
  getTenantContextFromDomain,
} from "@/lib/tenant-domains";
import { getTenantContextFromQrSlug } from "@/lib/tenant-context";

const handoffLifetimeMs = 2 * 60 * 1000;

function hashHandoffToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createCustomerAuthHandoff(input: {
  customerId: string;
  destinationOrigin: string;
  organizationId: string;
  returnTo: string;
}) {
  const token = randomBytes(32).toString("base64url");

  await getDb().insert(customerAuthHandoffs).values({
    customerId: input.customerId,
    destinationOrigin: input.destinationOrigin,
    expiresAt: new Date(Date.now() + handoffLifetimeMs),
    organizationId: input.organizationId,
    returnTo: input.returnTo,
    tokenHash: hashHandoffToken(token),
    updatedAt: new Date(),
  });

  return token;
}

export async function consumeCustomerAuthHandoff(
  tokenInput: unknown,
  requestHost: string | null,
) {
  const token = typeof tokenInput === "string" ? tokenInput.trim() : "";

  if (token.length < 32 || token.length > 200) {
    return null;
  }

  const db = getDb();
  const tokenHash = hashHandoffToken(token);
  const now = new Date();
  const [handoff] = await db
    .select()
    .from(customerAuthHandoffs)
    .where(
      and(
        eq(customerAuthHandoffs.tokenHash, tokenHash),
        isNull(customerAuthHandoffs.consumedAt),
        gt(customerAuthHandoffs.expiresAt, now),
      ),
    )
    .limit(1);

  if (!handoff) {
    return null;
  }

  const destination = new URL(handoff.destinationOrigin);
  const requestDomain = normalizeDomain(requestHost);

  if (!requestDomain || requestDomain !== normalizeDomain(destination.hostname)) {
    return null;
  }

  const safeReturnTo = getSafeCustomerReturnTo(handoff.returnTo, "");

  if (!safeReturnTo) {
    return null;
  }

  const returnUrl = new URL(safeReturnTo, handoff.destinationOrigin);
  const locationSlug =
    returnUrl.searchParams.get("location") ?? returnUrl.searchParams.get("qr");
  const tenantContext = isPlatformAdministrationDomain(requestDomain)
    ? locationSlug
      ? await getTenantContextFromQrSlug(locationSlug)
      : null
    : await getTenantContextFromDomain(requestDomain, locationSlug);

  if (tenantContext?.organizationId !== handoff.organizationId) {
    return null;
  }

  const [consumed] = await db
    .update(customerAuthHandoffs)
    .set({ consumedAt: now, updatedAt: now })
    .where(
      and(
        eq(customerAuthHandoffs.id, handoff.id),
        isNull(customerAuthHandoffs.consumedAt),
        gt(customerAuthHandoffs.expiresAt, now),
      ),
    )
    .returning({ customerId: customerAuthHandoffs.customerId });

  if (!consumed) {
    return null;
  }

  const [customer] = await db
    .select({ id: customers.id, email: customers.email, name: customers.name })
    .from(customers)
    .where(eq(customers.id, consumed.customerId))
    .limit(1);

  return customer ?? null;
}
