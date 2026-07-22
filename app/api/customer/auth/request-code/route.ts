import { NextResponse } from "next/server";

import {
  CustomerEmailOtpCooldownError,
  requestCustomerEmailOtp,
} from "@/lib/customer-email-otp";
import {
  assertOrganizationFeatureEnabled,
  FeatureEntitlementError,
} from "@/lib/feature-entitlements";
import { logError } from "@/lib/logger";
import { resolveOrganizationEmailIntegration } from "@/lib/organization-integrations";
import {
  checkRateLimit,
  getRequestRateLimitKey,
  rateLimitResponse,
} from "@/lib/rate-limit";
import { customerEmailOtpRequestSchema } from "@/lib/validations/customer-email-otp";
import { getPublicTenantContextFromRequest } from "@/lib/tenant-context";

export async function POST(request: Request) {
  if (!process.env.AUTH_SECRET) {
    return NextResponse.json(
      { error: "Email sign-in is temporarily unavailable." },
      { status: 503 },
    );
  }

  const rateLimit = await checkRateLimit({
    key: getRequestRateLimitKey(request, "customer:email-otp"),
    limit: 5,
    windowMs: 15 * 60 * 1000,
  });

  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit);
  }

  const body = await request.json().catch(() => null);
  const parsed = customerEmailOtpRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const tenantContext = await getPublicTenantContextFromRequest(request);
    await assertOrganizationFeatureEnabled(
      tenantContext.organizationId,
      "ordering.customer_accounts",
    );
    const delivery = await resolveOrganizationEmailIntegration(
      tenantContext.organizationId,
    );

    if (delivery.status !== "CONFIGURED") {
      return NextResponse.json(
        { error: "Email sign-in is temporarily unavailable." },
        { status: 503 },
      );
    }

    const { expiresAt } = await requestCustomerEmailOtp(parsed.data.email, delivery);

    return NextResponse.json({
      expiresAt: expiresAt.toISOString(),
      message: "If the address can receive email, a sign-in code has been sent.",
    });
  } catch (error) {
    if (error instanceof FeatureEntitlementError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    if (error instanceof CustomerEmailOtpCooldownError) {
      return NextResponse.json(
        { error: "Wait before requesting another code." },
        {
          status: 429,
          headers: { "Retry-After": String(error.retryAfterSeconds) },
        },
      );
    }

    logError("customer.email_otp.request_failed", error);
    return NextResponse.json(
      { error: "The sign-in code could not be sent. Please try again." },
      { status: 502 },
    );
  }
}
