import { NextRequest, NextResponse } from "next/server";

import { requireCustomerSession } from "@/lib/auth";
import {
  claimGuestOrder,
  CustomerOrderClaimError,
} from "@/lib/customer-order-claim";
import {
  assertOrganizationFeatureEnabled,
  FeatureEntitlementError,
} from "@/lib/feature-entitlements";
import {
  checkRateLimit,
  getRequestRateLimitKey,
  rateLimitResponse,
} from "@/lib/rate-limit";
import { getPublicTenantContextFromRequest } from "@/lib/tenant-context";
import { claimGuestOrderSchema } from "@/lib/validations/order";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireCustomerSession();

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rateLimit = await checkRateLimit({
      key: getRequestRateLimitKey(request, "customer:order-claim"),
      limit: 20,
      windowMs: 60_000,
    });

    if (!rateLimit.allowed) {
      return rateLimitResponse(rateLimit);
    }

    const body = await request.json().catch(() => null);
    const parsed = claimGuestOrderSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const [{ id }, tenantContext] = await Promise.all([
      context.params,
      getPublicTenantContextFromRequest(request),
    ]);
    await assertOrganizationFeatureEnabled(
      tenantContext.organizationId,
      "ordering.customer_accounts",
    );
    const result = await claimGuestOrder({
      customerId: session.user.id,
      customerToken: parsed.data.customerToken,
      orderId: id,
      tenantContext,
    });

    return NextResponse.json(result);
  } catch (error) {
    const status =
      error instanceof CustomerOrderClaimError
        ? error.status
        : error instanceof FeatureEntitlementError
          ? 403
          : 500;

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to link guest order.",
      },
      { status },
    );
  }
}
