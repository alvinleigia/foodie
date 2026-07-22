import { NextResponse } from "next/server";

import { requireCustomerSession } from "@/lib/auth";
import {
  getCustomerProfile,
  markCustomerPhoneVerified,
} from "@/lib/customer-account";
import {
  assertOrganizationFeatureEnabled,
  FeatureEntitlementError,
} from "@/lib/feature-entitlements";
import { logError } from "@/lib/logger";
import { getCustomerPhoneVerificationPolicy } from "@/lib/phone-verification-policy";
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
import { isValidCustomerPhone } from "@/lib/validations/customer";
import { phoneVerificationCodeSchema } from "@/lib/validations/phone-verification";

function providerErrorResponse(error: PhoneVerificationProviderError) {
  if (error.kind === "RATE_LIMITED") {
    return NextResponse.json(
      { error: "Too many verification attempts. Please wait and try again." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  return NextResponse.json(
    {
      error:
        error.kind === "REJECTED"
          ? "The code is invalid or has expired."
          : "Phone verification is temporarily unavailable.",
    },
    { status: error.kind === "REJECTED" ? 400 : 502 },
  );
}

export async function POST(request: Request) {
  const session = await requireCustomerSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = phoneVerificationCodeSchema.safeParse(
    await request.json().catch(() => null),
  );

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const policy = getCustomerPhoneVerificationPolicy();
  const provider = getPhoneVerificationProvider();

  if (!policy.available || !provider) {
    return NextResponse.json(
      { error: "Phone verification is temporarily unavailable." },
      { status: 503 },
    );
  }

  const ipRateLimit = await checkRateLimit({
    key: getRequestRateLimitKey(request, "customer:phone-verification:check"),
    limit: 10,
    windowMs: 10 * 60 * 1000,
  });

  if (!ipRateLimit.allowed) {
    return rateLimitResponse(ipRateLimit);
  }

  const customerRateLimit = await checkRateLimit({
    key: `customer:phone-verification:check:${session.user.id}`,
    limit: 10,
    windowMs: 10 * 60 * 1000,
  });

  if (!customerRateLimit.allowed) {
    return rateLimitResponse(customerRateLimit);
  }

  try {
    const tenantContext = await getPublicTenantContextFromRequest(request);
    await assertOrganizationFeatureEnabled(
      tenantContext.organizationId,
      "ordering.customer_accounts",
    );
    const customer = await getCustomerProfile(session.user.id, tenantContext);

    if (!customer || !isValidCustomerPhone(customer.phone)) {
      return NextResponse.json(
        { error: "Save a valid phone number before checking a code." },
        { status: 409 },
      );
    }

    if (customer.phoneVerifiedAt) {
      return NextResponse.json({
        status: "verified",
        verifiedAt: customer.phoneVerifiedAt.toISOString(),
      });
    }

    const isApproved = await provider.check(customer.phone!, parsed.data.code);

    if (!isApproved) {
      return NextResponse.json(
        { error: "The code is invalid or has expired." },
        { status: 400 },
      );
    }

    const verifiedAt = await markCustomerPhoneVerified(
      session.user.id,
      tenantContext,
      customer.phone!,
    );

    if (!verifiedAt) {
      return NextResponse.json(
        { error: "Your phone number changed. Save it and request a new code." },
        { status: 409 },
      );
    }

    return NextResponse.json({
      status: "verified",
      verifiedAt: verifiedAt.toISOString(),
    });
  } catch (error) {
    if (error instanceof FeatureEntitlementError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    if (error instanceof PhoneVerificationProviderError) {
      return providerErrorResponse(error);
    }

    logError("customer.phone_verification.check_failed", error, {
      customerId: session.user.id,
    });
    return NextResponse.json(
      { error: "The verification code could not be checked. Please try again." },
      { status: 502 },
    );
  }
}
