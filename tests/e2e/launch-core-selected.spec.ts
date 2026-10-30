import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

const root = process.cwd();

function source(relativePath: string) {
  return readFileSync(resolve(root, relativePath), "utf8");
}

test.describe("selected launch core", () => {
  test("delivers staff invitations with a manual-link fallback", () => {
    const invitations = source("lib/invitations.ts");
    const email = source("lib/staff-invitation-email.ts");
    const form = source("components/admin/StaffInviteForm.tsx");

    expect(invitations).toContain("sendStaffInvitationEmail({");
    expect(email).toContain('status: "SENT"');
    expect(email).toContain('reason: "DELIVERY_FAILED"');
    expect(form).toContain("share the link manually");

    for (const route of [
      "app/api/tenant/admin/staff/invite/route.ts",
      "app/api/company/users/invite/route.ts",
      "app/api/company/restaurants/[id]/staff/route.ts",
      "app/api/platform/companies/[id]/staff/route.ts",
    ]) {
      expect(source(route)).toContain("emailDelivery: invitation.emailDelivery");
    }
  });

  test("configures receipt format and footer without changing invoice snapshots", () => {
    const migration = source("drizzle/0082_restaurant_receipt_settings.sql");
    const receipt = source("components/receipt/OrderReceiptDocument.tsx");
    const settings = source("components/admin/RestaurantReceiptSettingsForm.tsx");

    expect(migration).toContain("THERMAL_80MM");
    expect(migration).toContain("FULL_PAGE");
    expect(settings).toContain("Save receipt settings");
    expect(receipt).toContain('receipt.receiptPrintFormat === "THERMAL_80MM"');
    expect(receipt).toContain('receipt.footerMessage ?? "Thank you for your order."');
  });

  test("snapshots configured service charges and optional checkout tips", () => {
    const orderRoute = source("app/api/orders/route.ts");
    const staffPayments = source("lib/staff-order-payments.ts");
    const settings = source("components/admin/RestaurantChargeSettingsForm.tsx");

    expect(settings).toContain("Service charge and tips");
    expect(orderRoute).toContain('type: "SERVICE_CHARGE" as const');
    expect(orderRoute).toContain('type: "TIP" as const');
    expect(orderRoute).toContain("customerFinancialSnapshot.finalTotalAmountSnapshot");
    expect(staffPayments).toContain("order.serviceChargeRateBpsSnapshot");
    expect(staffPayments).toContain('eq(orderAdjustments.type, "SERVICE_CHARGE")');
  });

  test("queues staff orders offline and replays them idempotently", () => {
    const orderRoute = source("app/api/orders/route.ts");
    const orderForm = source("components/order/OrderForm.tsx");
    const migration = source("drizzle/0084_staff_order_offline_continuity.sql");

    expect(migration).toContain("orders_organization_client_request_unique");
    expect(orderRoute).toContain("existingOrder");
    expect(orderRoute).toContain("replayed: true");
    expect(orderForm).toContain("queueOfflineStaffOrder({");
    expect(orderForm).toContain('window.addEventListener("online"');
  });
});
