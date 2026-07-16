# Offers And Promotions Roadmap

This file tracks the planned Coupons, Deals, Promotions and Happy Hours module for Foodie.

## Goal

Build one tenant-scoped Offers module that can support:

- Coupon codes entered by customers.
- Automatic deals applied by cart rules.
- Happy hour offers based on day and time.
- Promotional campaigns shown to customers.

The module must respect the existing SaaS hierarchy:

- Company-wide offers.
- Restaurant-level offers.
- Optional ordering-point eligibility within a restaurant.

## Core Principles

- Offers must never leak across companies or restaurants.
- Ordering-point rules are eligibility filters, not a separate tenant scope.
- Discounts must be calculated server-side before order creation.
- The customer UI should show the discount clearly before confirmation.
- Staff/order history should show which offer was applied.
- Admins should disable offers instead of deleting historical usage.
- Start with simple discount rules before adding complex bundle logic.

## Phase 1: MVP Coupon Foundation

- [ ] Add offer database tables for offer definitions and usage tracking.
- [ ] Support offer scopes: company and restaurant.
- [ ] Allow optional ordering-point eligibility for restaurant offers.
- [ ] Support manual coupon codes.
- [ ] Support percentage discounts.
- [ ] Support fixed amount discounts.
- [ ] Support minimum order value.
- [ ] Support active/inactive status.
- [ ] Support start date and expiry date.
- [ ] Support total usage limit.
- [ ] Support per-customer/device usage limit where possible.
- [ ] Validate coupon codes on the order review screen.
- [ ] Show discount, subtotal and final payable amount before order confirmation.
- [ ] Persist applied offer details on the order.
- [ ] Record offer usage after successful order creation.

## Phase 2: Admin UI

- [ ] Add Company Offers route for company owners/managers.
- [ ] Add Restaurant Offers route for restaurant managers.
- [ ] Add offer cards/list with action menu.
- [ ] Add create offer route.
- [ ] Add edit offer route.
- [ ] Add disable/enable offer action.
- [ ] Add offer usage view.
- [ ] Add audit logs for create, update, disable and usage export.
- [ ] Ensure order operators cannot manage offers.

## Phase 3: Automatic Deals

- [ ] Support automatic offers without coupon code.
- [ ] Support selected category eligibility.
- [ ] Support selected product eligibility.
- [ ] Support cart quantity rules.
- [ ] Support best-offer selection when multiple automatic offers match.
- [ ] Decide whether manual coupons can stack with automatic offers.
- [ ] Add clear customer-facing messaging for applied automatic discounts.

## Phase 4: Happy Hours

- [ ] Add day-of-week schedule rules.
- [ ] Add start/end time rules using the restaurant timezone.
- [ ] Support recurring happy hour offers.
- [ ] Show active happy hour promotions on the order page.
- [ ] Prevent timezone mismatch between admin setup and customer checkout.
- [ ] Add tests for offers crossing midnight.

## Phase 5: Promotions And Display

- [ ] Add promotional banner/content fields.
- [ ] Show active promotions on the customer order page.
- [ ] Support "no code needed" promotional messaging.
- [ ] Support campaign labels for reports.
- [ ] Add basic promotion performance summary.

## Phase 6: Reporting And Controls

- [ ] Add offer usage reports by company and restaurant, with optional ordering-point breakdowns.
- [ ] Add revenue impact reporting.
- [ ] Add CSV export for offer usage.
- [ ] Add suspicious usage checks for repeated device/customer usage.
- [ ] Add permission checks for cross-tenant offer reporting.
- [ ] Add tests for tenant isolation and discount calculations.

## Recommended MVP Scope

Start with:

- Manual coupon codes only.
- Percentage and fixed discounts.
- Minimum order value.
- Company and restaurant scope.
- Active/inactive.
- Date validity.
- Usage limit.
- Review-screen validation and order persistence.

Avoid in the first pass:

- Free item offers.
- Buy-one-get-one rules.
- Stacking multiple discounts.
- Complex customer identity checks.
- Payment-provider refund/discount reconciliation.

## Open Decisions

- [ ] Should company owners be allowed to target a restaurant offer to selected ordering points?
- [ ] Should restaurant managers be allowed to limit offers to selected ordering points?
- [ ] Should a manual coupon override automatic happy hour deals?
- [ ] Should multiple offers ever stack?
- [ ] Should discounts be visible to staff on the operations order board?
- [ ] Should customers be able to remove an applied automatic offer?

## UAT Scenarios To Add

- [ ] Valid coupon applies correct percentage discount.
- [ ] Valid coupon applies correct fixed discount.
- [ ] Expired coupon is rejected.
- [ ] Inactive coupon is rejected.
- [ ] Coupon below minimum order value is rejected.
- [ ] Coupon from Company A does not work for Company B.
- [ ] Ordering-point-limited coupon does not work at another ordering point.
- [ ] Usage limit blocks coupon after limit is reached.
- [ ] Order stores applied offer details.
- [ ] Reports show offer usage in the correct tenant scope.
