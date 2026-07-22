import { NextResponse } from "next/server";

import { requireCustomerSession } from "@/lib/auth";
import { getCustomerProfile } from "@/lib/customer-account";
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

function providerErrorResponse(error: PhoneVerificationProviderError) {
  if (error.kind === "RATE_LIMITED") {
    return NextResponse.json(
      { error: "Wait before requesting another code." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  if (error.kind === "REJECTED") {
    return NextResponse.json(
      { error: "A verification code could not be sent to this phone number." },
      { status: 400 },
    );
  }

  return NextResponse.json(
    { error: "Phone verification is temporarily unavailable." },
    { status: 502 },
  );
}

export async function POST(request: Request) {
  const session = await requireCustomerSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
    key: getRequestRateLimitKey(request, "customer:phone-verification:start"),
    limit: 5,
    windowMs: 10 * 60 * 1000,
  });

  if (!ipRateLimit.allowed) {
    return rateLimitResponse(ipRateLimit);
  }

  const customerRateLimit = await checkRateLimit({
    key: `customer:phone-verification:start:${session.user.id}`,
    limit: 5,
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
        { error: "Save a valid phone number before requesting a code." },
        { status: 409 },
      );
    }

    if (customer.phoneVerifiedAt) {
      return NextResponse.json({
        status: "verified",
        verifiedAt: customer.phoneVerifiedAt.toISOString(),
      });
    }

    await provider.start(customer.phone!);

    return NextResponse.json({ status: "pending" }, { status: 202 });
  } catch (error) {
    if (error instanceof FeatureEntitlementError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    if (error instanceof PhoneVerificationProviderError) {
      return providerErrorResponse(error);
    }

    logError("customer.phone_verification.start_failed", error, {
      customerId: session.user.id,
    });
    return NextResponse.json(
      { error: "The verification code could not be sent. Please try again." },
      { status: 502 },
    );
  }
}
