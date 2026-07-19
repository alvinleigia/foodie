import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireStaffSession } from "@/lib/auth";
import {
  cancelStaffStripeCheckout,
  collectStaffCashPayment,
  createStaffStripeCheckout,
  StaffOrderPaymentError,
} from "@/lib/staff-order-payments";
import { logError } from "@/lib/logger";
import { getCurrentTenantContext } from "@/lib/tenant-context";
import { FeatureEntitlementError } from "@/lib/feature-entitlements";

const paymentSchema = z.discriminatedUnion("method", [
  z.object({
    amount: z.string().trim().min(1).max(20),
    method: z.literal("CASH"),
    tenderedAmount: z.string().trim().min(1).max(20),
  }),
  z.object({
    method: z.literal("STRIPE_CHECKOUT"),
  }),
]);

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireStaffSession();

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = paymentSchema.safeParse(await request.json().catch(() => ({})));

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Choose a valid payment method and amount." },
        { status: 400 },
      );
    }

    const { id } = await context.params;
    const tenantContext = await getCurrentTenantContext();

    if (parsed.data.method === "CASH") {
      const result = await collectStaffCashPayment({
        actor: session.user,
        amount: parsed.data.amount,
        orderId: id,
        organizationId: tenantContext.organizationId,
        tenderedAmount: parsed.data.tenderedAmount,
      });

      return NextResponse.json({
        changeAmount: result.payment.changeAmount,
        paymentAmount: result.order.paymentAmount,
        paymentCollectedAmount: result.order.paymentCollectedAmount,
        paymentMethod: result.payment.method,
        paymentStatus: result.order.paymentStatus,
      });
    }

    const successUrl = new URL("/order/bill/payment/success", request.url);
    successUrl.searchParams.set("session_id", "{CHECKOUT_SESSION_ID}");
    const result = await createStaffStripeCheckout({
      actor: session.user,
      cancelUrl: new URL("/order/bill/payment/cancelled", request.url).toString(),
      orderId: id,
      organizationId: tenantContext.organizationId,
      successUrl: successUrl
        .toString()
        .replace("%7BCHECKOUT_SESSION_ID%7D", "{CHECKOUT_SESSION_ID}"),
    });

    return NextResponse.json({
      checkoutUrl: result.checkoutUrl,
      paymentAmount: result.order.paymentAmount,
      paymentCollectedAmount: result.order.paymentCollectedAmount,
      paymentMethod: "STRIPE_CHECKOUT",
      paymentStatus: result.order.paymentStatus,
    });
  } catch (error) {
    if (error instanceof FeatureEntitlementError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    if (error instanceof StaffOrderPaymentError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }

    logError("staff_order_payment_failed", error);

    return NextResponse.json(
      { error: "Payment could not be recorded." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireStaffSession();

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const tenantContext = await getCurrentTenantContext();
    const order = await cancelStaffStripeCheckout({
      actor: session.user,
      orderId: id,
      organizationId: tenantContext.organizationId,
    });

    return NextResponse.json({
      paymentAmount: order.paymentAmount,
      paymentCollectedAmount: order.paymentCollectedAmount,
      paymentStatus: order.paymentStatus,
    });
  } catch (error) {
    if (error instanceof StaffOrderPaymentError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }

    logError("staff_order_payment_cancel_failed", error);

    return NextResponse.json(
      { error: "Payment request could not be cancelled." },
      { status: 500 },
    );
  }
}
