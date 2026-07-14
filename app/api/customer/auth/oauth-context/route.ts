import { NextResponse } from "next/server";
import { z } from "zod";

import {
  createCustomerOAuthContextValue,
  customerOAuthContextCookieName,
  customerOAuthContextMaxAgeSeconds,
} from "@/lib/customer-oauth-context";
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

  const rateLimit = checkRateLimit({
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

    const response = NextResponse.json({ ready: true });
    const isSecure = new URL(request.url).protocol === "https:";

    response.cookies.set({
      name: customerOAuthContextCookieName,
      value: createCustomerOAuthContextValue(
        tenantContext.organizationId,
        parsed.data.provider,
      ),
      httpOnly: true,
      maxAge: customerOAuthContextMaxAgeSeconds,
      path: "/",
      sameSite: parsed.data.provider === "apple" ? "none" : "lax",
      secure: isSecure,
    });

    return response;
  } catch {
    return NextResponse.json(
      { error: "This sign-in option could not be started." },
      { status: 503 },
    );
  }
}
