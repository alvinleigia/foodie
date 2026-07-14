# Foodie POS

Foodie POS is a Next.js restaurant order operations MVP being evolved into a multi-tenant SaaS app for parent companies, restaurants, locations and staff users.

## Current Status

- Customer order page with cart and recent order status.
- Customer email OTP, Google, Apple and Facebook login, required name/phone onboarding, profile management and account-linked order history.
- Stripe Connect-hosted customer checkout with company/restaurant inheritance and webhook-gated fulfilment; staff-created orders bypass online payment.
- Company and restaurant integration settings with inherited SMTP2GO delivery, social login overrides, encrypted tenant credentials and Stripe connected-account onboarding.
- Staff operations panel with item-level order workflow.
- Menu manager for categories and products.
- Inventory manager for location-scoped product stock levels.
- Restaurant admin route for restaurant settings, location settings and staff access.
- Dedicated SaaS admin route shells at `/platform`, `/company` and `/restaurant`.
- Platform admin can create/manage parent company tenants.
- Company admin can create/manage child restaurant tenants and locations.
- Platform admin can directly create company owner/manager users.
- Company admin can create restaurant manager/order operator invite links.
- Users with multiple active location memberships can switch location context from the admin/operations header.
- Platform/company dashboards show first summary cards for tenants, locations, staff and order activity.
- Company and restaurant dashboards show range-filtered operational reports for revenue, status counts, prep/collection timing, cancelled items, category mix, staff activity, location activity, top products and stock alerts, with CSV export.
- Platform commercial foundation includes seeded SaaS plans, company trial subscriptions, subscription status controls and platform commercial metrics.
- Suspended or cancelled tenants are blocked from login, tenant APIs, operations pages and public QR ordering.
- Platform admin can export company tenant data and disable company tenants.
- Phase 7 audit foundation records tenant-management, staff, menu, inventory and order-transition actions in `audit_logs`, with scoped dashboard viewing and CSV export.
- Phase 7 MVP rate limiting protects public order, order status, cancellation, invitation acceptance and credential-attempt flows.
- Phase 7 reliability hardening adds structured server logging and abortable customer/staff polling to avoid overlapping refresh calls.
- Restaurant admins can create staff invitation links so invited users set their own password.
- Public customer ordering supports location QR links such as `/order?qr=main-bar`.
- Menu items can be marked sold out from the menu manager.
- Restaurant managers can track current quantity, low-stock threshold, units and notes for each menu product.
- Inventory manager shows tracked, low-stock, out-of-stock and untracked product summary cards.
- Delivered order items automatically deduct tracked inventory for the matching menu product.
- Order numbers reset per restaurant location and business date instead of using one global platform sequence.
- Customer and staff order screens share the same order number/date display formatter.
- Public ordering shows low-stock/out-of-stock inventory states for tracked products and blocks zero-stock tracked products.
- Supabase/Postgres database via Drizzle.
- Auth.js credentials login backed by database users.
- Tenant foundation with organizations, locations and memberships.

See [SAAS_ROADMAP.md](./SAAS_ROADMAP.md) for the active phased implementation tracker.

## Environment

Create `.env.local` from `.env.example`:

```bash
DATABASE_URL="postgresql://user:password@host:6543/postgres"
AUTH_SECRET="replace-with-a-long-random-secret"
AUTH_GOOGLE_ID="google-oauth-client-id"
AUTH_GOOGLE_SECRET="google-oauth-client-secret"
AUTH_APPLE_ID="apple-services-id"
AUTH_APPLE_SECRET="apple-client-secret-jwt"
AUTH_FACEBOOK_ID="facebook-app-id"
AUTH_FACEBOOK_SECRET="facebook-app-secret"
SMTP2GO_API_KEY="api-..."
EMAIL_FROM="Foodie Orders <orders@example.com>"
TENANT_CREDENTIALS_ENCRYPTION_KEY="base64-encoded-32-byte-key"
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
STRIPE_CONNECT_WEBHOOK_SECRET="whsec_..."
PLATFORM_OWNER_USERNAME="owner"
PLATFORM_OWNER_EMAIL="owner@example.com"
PLATFORM_OWNER_PASSWORD="change-me"
ENABLE_UAT_DATABASE_RESET="false"
```

The `AUTH_GOOGLE_*`, `AUTH_APPLE_*` and `AUTH_FACEBOOK_*` values are the universal Foodie fallback. Company admins can replace them per provider, and restaurants can inherit the company setting, provide their own credentials or disable a provider. Tenant client secrets are encrypted with `TENANT_CREDENTIALS_ENCRYPTION_KEY`. OAuth callbacks use `/api/auth/callback/google`, `/api/auth/callback/apple` and `/api/auth/callback/facebook` on every ordering origin that uses the credentials. Apple requires HTTPS and a client-secret JWT. Facebook sign-in requires Facebook to return an email address.

Customer email OTP resolves restaurant, company and optional platform SMTP2GO settings in that order. Leave `SMTP2GO_API_KEY` and `EMAIL_FROM` unset when no platform fallback should exist. Custom SMTP2GO keys are encrypted with `TENANT_CREDENTIALS_ENCRYPTION_KEY`; sender addresses or domains must be verified in SMTP2GO. Codes expire after 10 minutes and are stored only as keyed hashes.

`/api/stripe/webhook` remains the platform-account endpoint for legacy Checkout sessions. Configure `/api/stripe/connect/webhook` as a connected-account event destination for `account.updated`, Checkout session completed, async payment succeeded/failed and session expired events, then store its signing secret in `STRIPE_CONNECT_WEBHOOK_SECRET`.

`PLATFORM_OWNER_USERNAME`, `PLATFORM_OWNER_EMAIL` and `PLATFORM_OWNER_PASSWORD` are used only to bootstrap the first SaaS owner. All company, restaurant and staff users should then be created through the platform/company/restaurant admin flows.

Set `ENABLE_UAT_DATABASE_RESET="true"` only on a UAT/dev database if you need the platform reset screen at `/platform/uat-reset`. Do not enable it for production.

## Setup

Install dependencies:

```bash
npm install
```

Apply migrations from the committed SQL files:

```bash
npm run db:migrate
```

Customer email OTP requires `0022_customer_email_otp.sql`, tenant integrations require `0023_tenant_integrations.sql`, and tenant social login overrides require `0024_tenant_oauth_settings.sql`. The migration runner applies each migration automatically when it has not already been recorded in `app_migrations`.

For a clean development reset, run the reset-and-migrate command. This deletes the full `public` schema, so use it only for test/dev databases:

```bash
npm run db:reset:migrate
```

Avoid using `npm run db:push` as the normal setup path. It depends on Drizzle database introspection and has been fragile with enum changes on Supabase.

Bootstrap or verify the SaaS owner:

```bash
npm run db:bootstrap:platform
```

Verify tenant foundation:

```bash
npm run db:verify:tenant
```

Start development:

```bash
npm run dev
```

Open:

- Customer order page: `http://localhost:3000/order`
- Location QR customer order page: `http://localhost:3000/order?qr=your-location-qr-slug`
- Customer order status page: `http://localhost:3000/order/status?qr=your-location-qr-slug`
- Operations orders: `http://localhost:3000/operations/orders`
- Operations menu manager: `http://localhost:3000/operations/menu`
- Operations inventory manager: `http://localhost:3000/operations/inventory`
- Restaurant admin: `http://localhost:3000/restaurant`
- Company admin shell: `http://localhost:3000/company`
- Platform admin shell: `http://localhost:3000/platform`

## Verification

Run before commits or deploys:

```bash
npm run lint
npm run build
```

## SaaS Notes

- There is no hidden default company, restaurant or location. The SaaS owner creates real companies, then company users create restaurants and locations.
- Protected staff routes resolve tenant/location from the signed-in user membership.
- Restaurant-level tenant admin APIs are protected by role checks and scoped to the signed-in membership.
- `/platform`, `/company` and `/restaurant` are role-protected SaaS admin route shells.
- Platform/company admin users can authenticate without a location-level membership.
- Direct staff creation is implemented; restaurant staff invitation links are implemented; email delivery is still planned.
- Membership switching validates active memberships before updating the session.
- Invitation tokens are stored as hashes and expire after 7 days.
- Dashboard summaries are scoped by platform/company access before returning counts.
- Audit logs are scoped by the signed-in user's role and tenant context before they are shown or exported.
- MVP rate limiting is currently in-memory per server instance; use Redis/Upstash or another shared store before serious production traffic.
- Public customer routes can resolve tenant/location from the location QR slug using `?qr=...`.
- Customer orders created from plain `/order` require a QR slug, location route/domain context, or signed-in location context.
- Inventory records are scoped by restaurant/location and linked to menu products.
- Inventory quantities are deducted when a staff user marks an order item delivered. Products with stock tracking disabled are ignored.
- Order creation validates tracked stock on the server before accepting the order.
- Order numbers are unique per organization/location/order date, so each location gets its own daily sequence.
