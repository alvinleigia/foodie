import { NextResponse } from "next/server";

import {
  CustomerEmailOtpCooldownError,
  isCustomerEmailOtpConfigured,
  requestCustomerEmailOtp,
} from "@/lib/customer-email-otp";
import { logError } from "@/lib/logger";
import {
  checkRateLimit,
  getRequestRateLimitKey,
  rateLimitResponse,
} from "@/lib/rate-limit";
import { customerEmailOtpRequestSchema } from "@/lib/validations/customer-email-otp";

export async function POST(request: Request) {
  if (!isCustomerEmailOtpConfigured()) {
    return NextResponse.json(
      { error: "Email sign-in is temporarily unavailable." },
      { status: 503 },
    );
  }

  const rateLimit = checkRateLimit({
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
    const { expiresAt } = await requestCustomerEmailOtp(parsed.data.email);

    return NextResponse.json({
      expiresAt: expiresAt.toISOString(),
      message: "If the address can receive email, a sign-in code has been sent.",
    });
  } catch (error) {
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
