import { NextResponse } from "next/server";

import {
  assertOrganizationFeatureEnabled,
  FeatureEntitlementError,
} from "@/lib/feature-entitlements";
import { logError } from "@/lib/logger";
import {
  getPhoneVerificationProvider,
  PhoneVerificationProviderError,
} from "@/lib/phone-verification-provider";
import {
  checkRateLimit,
  getRequestRateLimitKey,
  rateLimitResponse,
} from "@/lib/rate-limit";
import { getPublicTenantContextFromRequest } from "@/lib/tenant-context";
import { customerPhoneOtpRequestSchema } from "@/lib/validations/customer-phone-otp";

export async function POST(request: Request) {
  const provider = getPhoneVerificationProvider();

  if (!provider) {
    return NextResponse.json(
      { error: "Mobile sign-in is temporarily unavailable." },
      { status: 503 },
    );
  }

  const rateLimit = await checkRateLimit({
    key: getRequestRateLimitKey(request, "customer:phone-otp"),
    limit: 5,
    windowMs: 15 * 60 * 1000,
  });

  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit);
  }

  const parsed = customerPhoneOtpRequestSchema.safeParse(
    await request.json().catch(() => null),
  );

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const tenantContext = await getPublicTenantContextFromRequest(request);
    await assertOrganizationFeatureEnabled(
      tenantContext.organizationId,
      "ordering.customer_accounts",
    );
    await provider.start(parsed.data.phone);

    return NextResponse.json({ message: "A mobile sign-in code has been sent." });
  } catch (error) {
    if (error instanceof FeatureEntitlementError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    if (
      error instanceof PhoneVerificationProviderError &&
      error.kind === "RATE_LIMITED"
    ) {
      return NextResponse.json(
        { error: "Too many code requests. Wait and try again." },
        { status: 429 },
      );
    }

    logError("customer.phone_otp.request_failed", error);
    return NextResponse.json(
      { error: "The mobile sign-in code could not be sent." },
      { status: 502 },
    );
  }
}
