import { NextRequest, NextResponse } from "next/server";

import { requireCustomerSession, requireStaffPermission } from "@/lib/auth";
import {
  assertOrganizationFeatureEnabled,
  FeatureEntitlementError,
} from "@/lib/feature-entitlements";
import {
  cancelOrder,
  OrderCancellationError,
} from "@/lib/order-cancellation";
import {
  authorizeManagerAction,
  ManagerApprovalError,
} from "@/lib/manager-approval";
import { serializeOrder } from "@/lib/orders";
import {
  checkRateLimit,
  getRequestRateLimitKey,
  rateLimitResponse,
} from "@/lib/rate-limit";
import {
  getPublicTenantContextFromRequest,
  getStaffTenantContextFromRequest,
  StaffRestaurantContextError,
} from "@/lib/tenant-context";
import {
  customerCancelOrderSchema,
  staffCancelOrderSchema,
} from "@/lib/validations/order";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const session = await requireStaffPermission("orders.cancel");

    if (!session) {
      const customerSession = await requireCustomerSession();

      if (!customerSession) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      const rateLimit = checkRateLimit({
        key: getRequestRateLimitKey(request, "public:order-cancel"),
        limit: 20,
        windowMs: 60_000,
      });

      if (!rateLimit.allowed) {
        return rateLimitResponse(rateLimit);
      }

      const tenantContext = await getPublicTenantContextFromRequest(request);
      await assertOrganizationFeatureEnabled(
        tenantContext.organizationId,
        "ordering.customer_accounts",
      );
      const parsed = customerCancelOrderSchema.safeParse(body);

      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.flatten() },
          { status: 400 },
        );
      }

      const result = await cancelOrder({
        acknowledgedCancellationFeeBps:
          parsed.data.acknowledgedCancellationFeeBps,
        actorType: "CUSTOMER",
        cancelReason: parsed.data.cancelReason,
        customerId: customerSession.user.id,
        customerToken: parsed.data.customerToken,
        orderId: id,
        organizationId: tenantContext.organizationId,
      });

      return NextResponse.json({
        ...serializeOrder(result.order),
        refundError: result.error,
      });
    }

    const tenantContext = await getStaffTenantContextFromRequest(request);
    const parsed = staffCancelOrderSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const managerApproval = await authorizeManagerAction({
      actor: session.user,
      credentials: parsed.data.managerApproval,
      organizationId: tenantContext.organizationId,
    });

    const result = await cancelOrder({
      actorType: "STAFF",
      actorUser: session.user,
      managerApproval,
      canIssueRefund: session.user.permissions.includes("payments.refund"),
      applyCustomerCancellationFee:
        parsed.data.applyCustomerCancellationFee,
      cancellationFeeBps:
        parsed.data.cancellationFeePercent === undefined
          ? undefined
          : Math.round(parsed.data.cancellationFeePercent * 100),
      cancelReason: parsed.data.cancelReason,
      orderId: id,
      organizationId: tenantContext.organizationId,
      overrideReason: parsed.data.overrideReason,
      retryRefund: parsed.data.retryRefund,
    });

    return NextResponse.json({
      ...serializeOrder(result.order),
      refundError: result.error,
    });
  } catch (error) {
    const status =
      error instanceof OrderCancellationError ||
      error instanceof ManagerApprovalError ||
      error instanceof StaffRestaurantContextError
        ? error.status
        : error instanceof FeatureEntitlementError
          ? 403
        : 500;

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to cancel order.",
      },
      { status },
    );
  }
}
