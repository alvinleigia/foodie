import { NextResponse } from "next/server";
import { z } from "zod";

import {
  createCustomerOAuthContextValue,
} from "@/lib/customer-oauth-context";
import {
  assertOrganizationFeaturesEnabled,
  FeatureEntitlementError,
} from "@/lib/feature-entitlements";
import {
  getPlatformAdministrationOrigin,
  getPublicRequestOrigin,
} from "@/lib/deployment-domain";
import { getSafeCustomerReturnTo } from "@/lib/customer-navigation";
import type { SocialAuthProvider } from "@/lib/organization-integration-types";
import { resolveOrganizationOAuthIntegration } from "@/lib/organization-oauth-settings";
import {
  checkRateLimit,
  getRequestRateLimitKey,
  rateLimitResponse,
} from "@/lib/rate-limit";
import { getPublicTenantContextFromRequest } from "@/lib/tenant-context";

const requestSchema = z.object({
  provider: z.enum(["apple", "facebook", "google"]),
  returnTo: z.string().max(2_048).optional(),
});

const providerMap: Record<string, SocialAuthProvider> = {
  apple: "APPLE",
  facebook: "FACEBOOK",
  google: "GOOGLE",
};

export async function POST(request: Request) {
  if (!process.env.AUTH_SECRET) {
    return NextResponse.json(
      { error: "Customer login is temporarily unavailable." },
      { status: 503 },
    );
  }

  const rateLimit = await checkRateLimit({
    key: getRequestRateLimitKey(request, "customer:oauth-context"),
    limit: 20,
    windowMs: 15 * 60 * 1000,
  });

  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit);
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const tenantContext = await getPublicTenantContextFromRequest(request);
    await assertOrganizationFeaturesEnabled(
      tenantContext.organizationId,
      ["ordering.customer_accounts", "auth.social"],
    );
    const effective = await resolveOrganizationOAuthIntegration(
      tenantContext.organizationId,
      providerMap[parsed.data.provider],
    );

    if (effective.status !== "CONFIGURED") {
      return NextResponse.json(
        { error: "This sign-in option is temporarily unavailable." },
        { status: 503 },
      );
    }

    const destinationOrigin = getPublicRequestOrigin(request);
    const submittedReturnTo = parsed.data.returnTo
      ? new URL(parsed.data.returnTo, destinationOrigin)
      : new URL("/order/status", destinationOrigin);
    const returnTo = getSafeCustomerReturnTo(
      submittedReturnTo.origin === destinationOrigin
        ? `${submittedReturnTo.pathname}${submittedReturnTo.search}${submittedReturnTo.hash}`
        : undefined,
    );
    const state = createCustomerOAuthContextValue({
      destinationOrigin,
      organizationId: tenantContext.organizationId,
      provider: parsed.data.provider,
      returnTo,
    });
    const authorizationUrl = new URL(
      "/api/customer/auth/oauth-start",
      getPlatformAdministrationOrigin(request),
    );
    authorizationUrl.searchParams.set("state", state);

    return NextResponse.json({ authorizationUrl: authorizationUrl.toString() });
  } catch (error) {
    if (error instanceof FeatureEntitlementError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    return NextResponse.json(
      { error: "This sign-in option could not be started." },
      { status: 503 },
    );
  }
}
