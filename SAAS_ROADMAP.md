# Foodie Product And POS Roadmap

This is the main product roadmap and status tracker for Foodie.

Last reviewed: 22 July 2026.

## Status Guide

- `[x]` Implemented in the application.
- `[ ]` Not yet implemented or not yet verified.
- **Now** means required before onboarding live POS tenants.
- **Next** means required for a broader restaurant rollout.
- **Later** means an optional, premium or customer-growth module.

Implementation is not the same as production readiness. Features involving payments,
refunds, authentication, domains or tenant isolation remain blocked until their UAT
checks pass in every deployment cell.

## Product Position

Foodie should first launch as a cloud ordering and counter-service POS for:

- Quick-service restaurants.
- Takeaway and collection businesses.
- Bars and counter-service venues.
- Restaurants using customer QR or online payments.

Do not position Foodie as a complete full-service table POS until the table, seat,
course and split-check module is complete.

## Done: SaaS Foundation

- [x] Regional deployment cells with required domain, locale, timezone and currency settings.
- [x] Direct Platform -> Company -> Restaurant hierarchy with no legacy location layer.
- [x] Company and restaurant scoped administration.
- [x] Restaurant-scoped staff memberships and context switching.
- [x] Platform, company, restaurant manager and order operator roles.
- [x] Staff invitation links and password reset flows.
- [x] Staff session revocation after password changes or access removal.
- [x] Trial, active, suspended and cancelled subscription states.
- [x] Plan quotas for restaurants, users, monthly orders and storage.
- [x] Tenant data export and tenant disable controls.
- [x] Tenant-scoped audit logs and CSV export.
- [x] Company subdomain and custom-domain records.
- [x] Customer-facing custom domains with staff/admin work restricted to the platform domain.
- [x] Canonical company, restaurant and operations route slugs.
- [x] Deployment configuration verification during builds.

## Done: Customer Experience

- [x] Restaurant ordering pages and ordering-point QR links.
- [x] Customer email OTP login.
- [x] Universal Google, Apple and Facebook login foundation.
- [x] Company and restaurant OAuth inheritance or override.
- [x] Central social-login callback with customer-domain handoff.
- [x] Tenant-scoped customer profiles.
- [x] Required customer name and phone before checkout.
- [x] Active and completed customer order views.
- [x] Customer cancellation flow subject to the restaurant policy.
- [x] Privacy notice framework with tenant and platform placeholders.
- [x] Optional Twilio Verify provider adapter for future phone verification.

## Done: Menu And Ordering

- [x] Restaurant-scoped menu categories and products.
- [x] Product descriptions, prices and image links.
- [x] Modifier groups and modifier options.
- [x] Menu tags.
- [x] Sold-out controls.
- [x] Restaurant menu CSV import and export.
- [x] Customer and staff-created orders.
- [x] Daily restaurant order numbers.
- [x] Item notes and modifier snapshots on orders.
- [x] Item-level pending, preparing, ready, delivered and cancelled workflow.
- [x] Atomic compare-and-set order status transitions.
- [x] Concurrent inventory reservation protection.
- [x] Removal of the unsafe clear-all-orders workflow.

## Done: Payments And Refunds

- [x] Stripe Connect account inheritance and restaurant override.
- [x] Stripe-hosted customer checkout.
- [x] Webhook-gated customer-order fulfilment.
- [x] Staff-created unpaid bills.
- [x] Staff cash settlement with tendered amount and change calculation.
- [x] Partial cash payment and remaining-balance tracking.
- [x] Stripe Checkout links for a remaining staff bill balance.
- [x] Customer-facing Stripe payment QR codes for staff-created bills.
- [x] Separate payment records for each collected portion.
- [x] Cancellation fee percentage with manager override controls.
- [x] Refund allocation back to each original payment.
- [x] Automatic Stripe refund requests and recorded cash-return portions.
- [x] Refund retry and failed-refund visibility.
- [x] Payment and refund idempotency and database integrity constraints.
- [x] Durable Stripe webhook journal with safe duplicate, in-progress and failed-event replay handling.

Deployment note:

- [x] Confirm migration `0038_order_refund_payment_integrity.sql` is recorded in every live database.
- [x] Confirm migrations `0056_shared_rate_limits.sql` and `0057_stripe_webhook_events.sql` are recorded in every live database.
- [x] Complete duplicate, delayed and out-of-order Stripe webhook UAT.

## Done: Operations And Reporting

- [x] Staff order board with item-level actions, bounded history pagination and adaptive polling.
- [x] Restaurant product-level inventory quantities.
- [x] Low-stock and out-of-stock warnings.
- [x] Inventory deduction after item delivery.
- [x] Company and restaurant dashboards.
- [x] Revenue, order status, timing, cancellation, product and staff reports.
- [x] CSV report export.
- [x] Structured server logging foundation.
- [x] Abortable customer and staff polling.

## Done: Security Foundation

- [x] Tenant-scoped route authorization.
- [x] Revalidation of active staff membership and session version.
- [x] Shared database-backed rate limiting for public and credential endpoints.
- [x] Content Security Policy.
- [x] Anti-framing, nosniff, Referrer Policy and Permissions Policy headers.
- [x] Disabled `X-Powered-By` response header.
- [x] Drizzle ORM upgraded to the identifier-escaping security patch.
- [x] Automated coverage for session revocation, order concurrency and security headers.

## Now: POS Financial Core

These changes should be designed before real tenants build transaction history.

- [x] Enforce feature entitlements at product entry points instead of relying only on plan quotas.
- [x] Enforce customer-ordering access on public order pages, menu reads and customer order creation.
- [x] Enforce customer-account access on sign-in, profile, order history and customer order actions.
- [x] Enforce social-login access throughout provider selection, callback and customer-domain handoff.
- [x] Enforce Stripe access on customer Checkout, staff payment links and Connect setup while preserving in-flight reconciliation.
- [x] Enforce staff-billing access on cash, partial and new payment-link settlement while preserving open payment requests.
- [x] Enforce inventory access on stock management and automatic stock reservations while preserving existing reservation cleanup.
- [x] Enforce operational-report access on company and restaurant dashboards and CSV exports.
- [x] Enforce custom-domain access on management and public host resolution while preserving platform-managed tenant subdomains.
- [x] Add a feature catalogue and plan-to-feature entitlements.
- [x] Add platform controls for company or restaurant feature overrides.
- [x] Add restaurant tax and VAT profiles.
- [x] Support tax-inclusive and tax-exclusive pricing.
- [x] Snapshot tax rate, taxable amount and tax amount on each order line.
- [x] Add a typed order-adjustments ledger for discounts, comps, service charges and tips.
- [x] Store immutable subtotal, discount, tax, charge, tip and final-total snapshots.
- [x] Add consistent monetary rounding rules per currency.
- [x] Reconcile financial reports from order, adjustment, payment and refund ledgers.
- [x] Add sequential receipt and invoice numbers per restaurant.
- [x] Add printable and email receipts.
- [x] Add UK simplified VAT invoice support and full VAT invoice data when required.
- [x] Add multiple named restaurant taxes with effective-dated rates.
- [x] Support restaurant-default and item-specific tax assignments.
- [x] Snapshot every applied tax component on each order line.
- [x] Show immutable tax-component breakdowns on receipts, VAT invoices and reports.

## Now: Core Restaurant Operations

- [x] Add fulfilment types: dine-in, takeaway, collection and delivery.
- [x] Add promised or scheduled fulfilment time.
- [x] Add basic discount and comp actions with reason codes.
- [x] Add granular staff permissions instead of role-only action access.
- [x] Add manager approval or PIN for refunds, voids, discounts and sensitive overrides.
- [x] Add cash drawer sessions with opening float.
- [x] Add cash paid-in and paid-out movements with reasons.
- [x] Add expected-versus-counted cash reconciliation.
- [x] Add shift and end-of-day close reports.
- [x] Add basic prep stations and route products to kitchen or bar stations.
- [x] Add kitchen ticket printing or a dedicated KDS station view.
- [x] Add expeditor or final-assembly status where required.

## Now: Launch Decisions

Each item needs an explicit product decision before Foodie is sold as a POS.

- [ ] Integrate a card-present terminal provider, or describe the first release as cash plus QR/online payment only.
- [ ] Implement offline order continuity, or document the pilot as online-only with a manual outage procedure.
- [ ] Decide whether tips and service charges are part of the first quick-service release.
- [ ] Decide whether one order always maps to one bill in the quick-service release.
- [ ] Decide which receipt formats are mandatory at launch.

## Now: Production Readiness

- [x] Replace the in-memory rate limiter with a shared PostgreSQL limiter.
- [ ] Add and test database backup and restore procedures.
- [x] Add Stripe webhook failure alerts and verify platform-owned email delivery in staging.
- [x] Add deduplicated unhandled server-error monitoring and expose operational alert ownership to platform admins.
- [x] Expose deployment Git SHA, deployment cell and configured/runtime region for release verification.
- [x] Add an automated live release verifier for SHA, deployment cell, response headers and Vercel runtime region.
- [x] Run the live release verifier against staging and production for the current approved release.
  - Staging verified on 22 July 2026 at `b738580` (`uk-uat-1`, Vercel `production`, `hnd1`).
  - UK production verified on 22 July 2026 at `a4f681f` (`uk-prod-1`, Vercel `production`, `lhr1`).
  - Release and database verification evidence is retained in GitHub pull request `#13`.
- [x] Replace constant order-board polling with adaptive, visibility-aware polling and paginated history.
- [x] Complete paid checkout, cancellation and refund UAT.
- [x] Add automated duplicate, concurrent and failed Stripe webhook replay gates.
- [x] Test duplicate, delayed and failed webhooks.
- [x] Test disabled-staff and password-reset session revocation end to end.
- [x] Add credential-driven live order-race and two-restaurant isolation gates.
- [x] Test two-restaurant isolation using real manager accounts.
- [x] Add a credential-driven live white-label email and Google authentication gate.
- [x] Test email OTP end to end from a white-label customer domain.
- [x] Test Google login end to end from a white-label customer domain.
- [x] Test OTP delivery to Gmail and inspect SPF and DKIM results.
- [x] Test OTP delivery to Outlook and inspect SPF and DKIM results.
- [ ] Add and validate the DMARC record for the sending domain.
- [x] Complete platform, restaurant, ordering-point and custom-domain routing UAT.
- [x] Verify every staff/admin route redirects away from customer domains.
- [x] Add a redacted launch environment inventory with provider-pair and production-safety validation.
- [x] Run `verify:environment` and `verify:release` against the current staging and production deployment cells and retain the result.
- [ ] Repeat `verify:environment` and `verify:release` for every future approved release.
- [ ] Consider Supabase Row Level Security as defence in depth.

## Now: Compliance And Tenant Operations

- [ ] Replace all privacy-notice placeholders with approved company information.
- [ ] Obtain legal review for privacy, retention, cancellation and refund wording.
- [ ] Document customer data access, correction and deletion procedures.
- [ ] Document platform support access to tenant data.
- [ ] Audit access to audit-log views and exports.
- [ ] Avoid storing secrets or unnecessary personal data in audit metadata.
- [ ] Decide whether customer phone verification is required at launch.
- [ ] Configure Twilio Verify only when SMS verification is enabled.
- [ ] Add real email delivery for staff invitations.

## Conditional: Full-Service Restaurant Module

Move this section into **Now** before onboarding full-service table restaurants.

- [ ] Add restaurant floor plans.
- [ ] Add structured dining tables instead of free-text table numbers.
- [ ] Add table sessions and cover counts.
- [ ] Add seat assignment.
- [ ] Add courses and controlled kitchen firing.
- [ ] Separate the kitchen order from the financial check or bill.
- [ ] Support multiple checks for one table session.
- [ ] Transfer and merge tables or checks.
- [ ] Split checks by seat, item, amount or equal share.
- [ ] Support multiple card payments on one bill.
- [ ] Add server assignment and table handover.
- [ ] Add table progress and occupancy states.

## Next: Operational Expansion

- [ ] Add ingredient and recipe inventory.
- [ ] Add ingredient depletion from product sales.
- [ ] Add stock adjustments, waste and variance tracking.
- [ ] Add suppliers and purchase orders.
- [ ] Add stock transfers between restaurants.
- [ ] Add menu availability schedules and time-based menus.
- [ ] Add allergen and dietary information.
- [ ] Add customer-facing and kitchen printer configuration.
- [ ] Add accounting export or accounting-provider integrations.
- [ ] Add tenant-scoped image uploads and storage limits.
- [ ] Automate Vercel custom-domain registration after manual routing is proven.
- [ ] Build a guided company and restaurant onboarding flow.

## Later: Premium And Customer-Growth Modules

- [ ] Coupon codes and basic offers.
- [ ] Automatic promotions and happy hours.
- [ ] Loyalty points and rewards.
- [ ] Gift cards and stored value.
- [ ] Customer segments and marketing campaigns.
- [ ] Birthday and visit-history offers.
- [ ] Reservations and waitlists.
- [ ] Delivery marketplace integrations.
- [ ] Staff time clock, scheduling and payroll integrations.
- [ ] Advanced inventory forecasting and recipe costing.
- [ ] Advanced multi-restaurant menu synchronisation.
- [ ] PDF and scheduled reports.
- [ ] Self-service kiosks.
- [ ] Customer-facing displays.
- [ ] Branded customer applications.
- [ ] Personalised upsells and recommendations.
- [ ] AI-assisted forecasting, menu analysis and operational insights.

The detailed offers plan remains in `OFFERS_ROADMAP.md`.

## Tenant-Safe Architecture Rules

All future modules must follow these rules so existing tenants can adopt them safely:

- Use additive database migrations with explicit backfills.
- Never calculate historical tax, discounts or charges from current settings.
- Snapshot financial and policy values when the transaction is created.
- Keep one shared schema with strict organization scoping.
- Add features through entitlements, not tenant-specific code branches.
- Use company defaults with optional restaurant overrides.
- Keep payment, SMS, email, printer and delivery providers behind adapters.
- Prefer typed ledgers for financial changes instead of adding one column per feature.
- Version pricing and policy behaviour when calculation rules change.
- Keep audit and financial history immutable.
- Disable tenants, users and definitions instead of hard-deleting referenced history.
- Add new premium features disabled by default, then enable them by plan or override.

## Code Health Track

Complete these alongside product work when touching the affected modules:

- [ ] Split `lib/saas-admin.ts` into focused tenant, user, domain and reassignment services.
- [ ] Split `lib/saas-reports.ts` into financial and operational report modules.
- [ ] Split `components/order/OrderForm.tsx` into focused cart, menu and review components.
- [ ] Split `components/staff/MenuManager.tsx` into focused forms and product-list components.
- [ ] Split `components/staff/StaffOrderBoard.tsx` before adding further complex order-panel workflows.
- [ ] Add broader tenant-isolation tests for menus, inventory, orders and reports.
- [ ] Add workflow tests before extending order, check or kitchen states.
- [ ] Consolidate repeated authenticated API validation, logging and error responses carefully.
- [ ] Extend shared money formatting and minor-unit calculations into every financial report.

## Launch Automation Commands

Run the local regression gate on every release candidate:

```powershell
npm run verify:environment -- --profile staging # or production
npm run lint
npx tsc --noEmit
npx playwright test
npm run build
```

After deploying a candidate, load that cell's environment and run the verifier against
the exact platform domain. It compares `/api/version` and deployment response headers
with the approved local Git commit and configured deployment cell:

```powershell
# Current staging cell (Tokyo Vercel Functions)
npm run verify:release -- --runtime-region hnd1

# Current UK production cell (London Vercel Functions)
npm run verify:release -- --runtime-region lhr1
```

The command must pass separately after every staging and production deployment.

The following live tests are opt-in because they create UAT data or require direct
database access:

- `tests/e2e/order-status-concurrency-live.spec.ts`
- `tests/e2e/domain-routing-live.spec.ts`
- `tests/e2e/stripe-webhook-replay-live.spec.ts`
- `tests/e2e/staff-session-revocation-live.spec.ts`
- `tests/e2e/tenant-isolation.spec.ts`

Keep their credentials and database URLs in the test runner environment. Never add
them to this repository.

## Recommended Execution Order

1. Add feature entitlements and document the order/check/financial architecture.
2. Implement tax, VAT, adjustments, immutable totals and receipts.
3. Implement fulfilment types, granular permissions and manager approvals.
4. Implement cash drawer sessions and end-of-day reconciliation.
5. Implement basic kitchen or bar prep-station routing.
6. Complete shared rate limiting, backups, monitoring and the required UAT gate.
7. Pilot with one quick-service restaurant and one second restaurant for isolation testing.
8. Build the full-service module only when that market is being onboarded.
9. Add premium growth modules after the operational core is stable.

## Quick-Service Launch Gate

Foodie is ready for live quick-service tenants only when:

- [ ] Tax, VAT, totals and receipts reconcile exactly.
- [ ] Cash and Stripe settlements match end-of-day reports.
- [x] Refund and duplicate-webhook tests pass.
- [ ] Sensitive staff actions require the correct permission or approval.
- [ ] Kitchen or bar routing is reliable during a busy-order test.
- [x] Two-restaurant isolation tests pass.
- [x] Authentication and session revocation tests pass.
- [ ] Backup restoration is demonstrated.
- [x] Monitoring and webhook alerts have an owner and staging alert delivery was verified.
- [x] Domain, OAuth, SMTP SPF/DKIM and deployment-cell checks pass for the current release.
- [ ] Product positioning clearly states any card-terminal or offline limitations.

## Working Notes

- Use `npm run db:migrate` for committed migrations.
- Use `npm run db:reset:migrate` only for intentional test database resets.
- Avoid `npm run db:push` as the normal migration path.
- Run focused tests, `npm run lint` and `npm run build` after implementation work.
- Keep this roadmap updated when a feature is implemented and again when its UAT gate passes.

## Benchmark References

- Square for Restaurants pricing and feature comparison:
  `https://squareup.com/gb/en/point-of-sale/restaurants/pricing`
- Toast restaurant POS:
  `https://pos.toasttab.com/products/point-of-sale`
- Toast kitchen display system:
  `https://pos.toasttab.com/hardware/kitchen-display-system`
- Lightspeed Restaurant features:
  `https://www.lightspeedhq.co.uk/pos/restaurant/multi-location-pos/`
- TouchBistro restaurant POS:
  `https://www.touchbistro.com/pos/`
- HMRC VAT record and invoice guidance:
  `https://www.gov.uk/guidance/record-keeping-for-vat-notice-70021`
