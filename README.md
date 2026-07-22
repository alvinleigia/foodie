# Foodie POS

Foodie POS is a Next.js restaurant operations app with a multi-tenant SaaS hierarchy of platform, companies, restaurants and restaurant staff.

## Current Status

- Customer order page with cart and recent order status.
- Customer email OTP, Google, Apple and Facebook login, required name/phone onboarding, profile management and active/completed order views.
- Stripe Connect-hosted customer checkout with company/restaurant inheritance and webhook-gated fulfilment; staff-created orders bypass online payment.
- Company and restaurant integration settings with inherited SMTP2GO delivery, social login overrides, encrypted tenant credentials and Stripe connected-account onboarding.
- Staff operations panel with item-level order workflow.
- Menu manager for categories and products.
- Inventory manager for restaurant-scoped product stock levels.
- Restaurant admin routes for restaurant settings, ordering-point settings and staff access.
- Dedicated SaaS admin route shells at `/platform`, `/company` and `/restaurant`.
- Platform admin can create/manage parent company tenants.
- Company admin can create and manage child restaurant tenants.
- Platform admin can directly create company owner/manager users.
- Company admin can create restaurant manager/order operator invite links.
- Users with multiple active organization memberships can switch company or restaurant context from the admin/operations header.
- Platform/company dashboards show summary cards for companies, restaurants, staff and order activity.
- Company and restaurant dashboards show range-filtered operational reports for revenue, status counts, prep/collection timing, cancelled items, category mix, staff activity, restaurant activity, top products and stock alerts, with CSV export.
- Platform commercial foundation includes seeded SaaS plans, company trial subscriptions, subscription status controls and platform commercial metrics.
- Suspended or cancelled tenants are blocked from login, tenant APIs, operations pages and public QR ordering.
- Platform admin can export company tenant data and disable company tenants.
- Phase 7 audit foundation records tenant-management, staff, menu, inventory and order-transition actions in `audit_logs`, with scoped dashboard viewing and CSV export.
- Phase 7 MVP rate limiting protects public order, order status, cancellation, invitation acceptance and credential-attempt flows.
- Phase 7 reliability hardening adds structured server logging and abortable customer/staff polling to avoid overlapping refresh calls.
- Restaurant admins can create staff invitation links so invited users set their own password.
- Public customer ordering supports restaurant-owned ordering-point QR links such as `/order?qr=main-bar`.
- Menu items can be marked sold out from the menu manager.
- Restaurant managers can track current quantity, low-stock threshold, units and notes for each menu product.
- Inventory manager shows tracked, low-stock, out-of-stock and untracked product summary cards.
- Delivered order items automatically deduct tracked inventory for the matching menu product.
- Order numbers reset per restaurant and business date instead of using one global platform sequence.
- Customer and staff order screens share the same order number/date display formatter.
- Public ordering shows low-stock/out-of-stock inventory states for tracked products and blocks zero-stock tracked products.
- Supabase/Postgres database via Drizzle.
- Auth.js credentials login backed by database users.
- Tenant foundation with company/restaurant organizations, restaurant memberships and optional ordering points.

See [SAAS_ROADMAP.md](./SAAS_ROADMAP.md) for the active phased implementation tracker.

## Environment

Create `.env.local` from `.env.example`:

```bash
DATABASE_URL="postgresql://user:password@host:6543/postgres"
AUTH_SECRET="replace-with-a-long-random-secret"
AUTH_TRUST_HOST="true"
DEPLOYMENT_CELL_ID="in-local-1"
DEPLOYMENT_REGION="IN"
APP_ROOT_DOMAIN="foodie.leigia.com"
NEXT_PUBLIC_DEFAULT_LOCALE="en-IN"
NEXT_PUBLIC_DEFAULT_TIMEZONE="Asia/Calcutta"
NEXT_PUBLIC_DEFAULT_CURRENCY="INR"
EXPECTED_VERCEL_RUNTIME_REGION="bom1"
EXPECTED_VERCEL_ENV="production"
AUTH_GOOGLE_ID="google-oauth-client-id"
AUTH_GOOGLE_SECRET="google-oauth-client-secret"
AUTH_APPLE_ID="apple-services-id"
AUTH_APPLE_SECRET="apple-client-secret-jwt"
AUTH_FACEBOOK_ID="facebook-app-id"
AUTH_FACEBOOK_SECRET="facebook-app-secret"
SMTP2GO_API_KEY="api-..."
EMAIL_FROM="Foodie Orders <orders@example.com>"
OPERATIONAL_ALERT_EMAIL="ops@example.com"
CUSTOMER_PHONE_VERIFICATION_PROVIDER="disabled"
CUSTOMER_PHONE_VERIFICATION_REQUIRED="false"
TWILIO_ACCOUNT_SID=""
TWILIO_AUTH_TOKEN=""
TWILIO_VERIFY_SERVICE_SID=""
TENANT_CREDENTIALS_ENCRYPTION_KEY="base64-encoded-32-byte-key"
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
STRIPE_CONNECT_WEBHOOK_SECRET="whsec_..."
PRIVACY_NOTICE_EFFECTIVE_DATE="replace-before-public-launch"
PRIVACY_PLATFORM_ADDRESS="replace-before-public-launch"
PRIVACY_PLATFORM_EMAIL="privacy@example.com"
PRIVACY_PLATFORM_ICO_NUMBER="replace-before-public-launch"
PRIVACY_PLATFORM_LEGAL_NAME="replace-before-public-launch"
PRIVACY_CONTROLLER_ADDRESS="replace-before-public-launch"
PRIVACY_CONTROLLER_EMAIL="privacy@example.com"
PRIVACY_CONTROLLER_LEGAL_NAME="replace-before-public-launch"
PRIVACY_INTERNATIONAL_TRANSFERS="replace-before-public-launch"
PRIVACY_RETENTION_PROFILE="replace-before-public-launch"
PRIVACY_RETENTION_AUTH="replace-before-public-launch"
PRIVACY_RETENTION_ORDERS="replace-before-public-launch"
PRIVACY_RETENTION_SECURITY="replace-before-public-launch"
PRIVACY_RETENTION_MARKETING="replace-before-public-launch"
PLATFORM_OWNER_USERNAME="owner"
PLATFORM_OWNER_EMAIL="owner@example.com"
PLATFORM_OWNER_PASSWORD="change-me"
ENABLE_UAT_DATABASE_RESET="false"
```

The `AUTH_GOOGLE_*`, `AUTH_APPLE_*` and `AUTH_FACEBOOK_*` values are the universal Foodie fallback. Company admins can replace them per provider, and restaurants can inherit the company setting, provide their own credentials or disable a provider. Tenant client secrets are encrypted with `TENANT_CREDENTIALS_ENCRYPTION_KEY`.

All social login apps use one callback origin, even when customers order on a tenant-owned domain:

```text
https://<APP_ROOT_DOMAIN>/api/customer-social-auth/callback/google
https://<APP_ROOT_DOMAIN>/api/customer-social-auth/callback/apple
https://<APP_ROOT_DOMAIN>/api/customer-social-auth/callback/facebook
```

Foodie returns the customer to the ordering domain with a short-lived, single-use session handoff. Apple requires HTTPS and a client-secret JWT. Facebook sign-in requires Facebook to return an email address.

Staff login, operations and administration run only on `APP_ROOT_DOMAIN`. Company subdomains and custom tenant domains are customer-facing and serve ordering, customer account and payment views. Privileged paths opened on a tenant domain redirect to the platform domain.

Customer email OTP resolves restaurant, company and optional platform SMTP2GO settings in that order. Leave `SMTP2GO_API_KEY` and `EMAIL_FROM` unset when no platform fallback should exist. Custom SMTP2GO keys are encrypted with `TENANT_CREDENTIALS_ENCRYPTION_KEY`; sender addresses or domains must be verified in SMTP2GO. Codes expire after 10 minutes and are stored only as keyed hashes.

`OPERATIONAL_ALERT_EMAIL` is the platform-owned operations inbox shown on the platform dashboard. Stripe sends one alert there when an event first fails processing; later Stripe retries remain recorded in the webhook journal without generating duplicate email alerts. Unhandled server request errors are also reported there and deduplicated by error fingerprint for 15 minutes. These application-error alerts omit request headers, query strings and stack traces. Alert delivery uses the platform `SMTP2GO_API_KEY` and `EMAIL_FROM` values and never changes the response returned to a customer or Stripe.

`/api/stripe/webhook` remains the platform-account endpoint for legacy Checkout sessions. Configure `/api/stripe/connect/webhook` as a connected-account event destination for `account.updated`, `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `refund.created`, `refund.updated` and `refund.failed`, then store its signing secret in `STRIPE_CONNECT_WEBHOOK_SECRET`.

`PLATFORM_OWNER_USERNAME`, `PLATFORM_OWNER_EMAIL` and `PLATFORM_OWNER_PASSWORD` are used only to bootstrap the first SaaS owner. All company, restaurant and staff users should then be created through the platform/company/restaurant admin flows.

Each regional installation is an independent deployment cell with its own Vercel project, database and environment variables. `DEPLOYMENT_CELL_ID`, `DEPLOYMENT_REGION`, `APP_ROOT_DOMAIN`, `NEXT_PUBLIC_DEFAULT_LOCALE`, `NEXT_PUBLIC_DEFAULT_TIMEZONE` and `NEXT_PUBLIC_DEFAULT_CURRENCY` are required. There are no regional fallbacks: verification and production builds fail when the cell configuration is missing or invalid. The `NEXT_PUBLIC_*` values are embedded during `next build`, so redeploy after changing them.

`AUTH_TRUST_HOST` must be `true` for hosted cells. `EXPECTED_VERCEL_RUNTIME_REGION` records the Vercel function region that must match the database locality, while `EXPECTED_VERCEL_ENV` records the expected Vercel environment (`production`, `preview` or `development`). These values are identifiers, not secrets.

For example, a UK UAT installation can use:

```bash
DEPLOYMENT_CELL_ID="uk-uat-1"
DEPLOYMENT_REGION="UK-UAT"
APP_ROOT_DOMAIN="foodie-uk-staging.example.com"
NEXT_PUBLIC_DEFAULT_LOCALE="en-GB"
NEXT_PUBLIC_DEFAULT_TIMEZONE="Europe/London"
NEXT_PUBLIC_DEFAULT_CURRENCY="GBP"
```

Keep `DATABASE_URL`, `AUTH_SECRET`, tenant credential encryption keys, SMTP, OAuth and Stripe credentials separate for each deployment cell. `npm run build` automatically runs `npm run verify:deployment`, then migrations and `npm run db:bootstrap:platform` must run against that cell's database. Bootstrap binds the database to `DEPLOYMENT_CELL_ID`, applies the configured platform locale and root domain, and refuses to modify a database already bound to another cell.

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

Customer email OTP requires `0022_customer_email_otp.sql`, tenant integrations require `0023_tenant_integrations.sql`, tenant social login overrides require `0024_tenant_oauth_settings.sql`, strict cell defaults require `0026_cell_deployment_defaults.sql`, and centralized customer social login requires `0027_customer_auth_handoffs.sql`. Migration `0028_customer_facing_tenant_domains.sql` makes all non-platform domains customer-facing. The migration runner applies each migration automatically when it has not already been recorded in `app_migrations`.

The direct company/restaurant model is completed by migrations `0029` through `0033`. These add restaurant-owned ordering points, move staff and operational data to restaurant scope, restrict customer domains to company/restaurant ownership and remove the legacy locations schema. Each migration and its `app_migrations` record are applied in one database transaction.

Order cancellation and refund tracking requires migrations `0034` through `0034c`. These add the cancellation policy snapshot, cancellation and refund ledgers, and partial/failed refund payment states.

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

Verify regional deployment settings:

```bash
npm run verify:deployment
```

Before approving a deployment cell, run its redacted launch environment inventory:

```bash
npm run verify:environment -- --profile staging
npm run verify:environment -- --profile production
```

Use the profile matching the Vercel project being reviewed. Both profiles require the
runtime cell, authentication, platform SMTP2GO fallback, operational alerts, Google
login, Stripe Connect and an explicit phone-verification policy. Optional Apple,
Facebook, Twilio, legacy Stripe webhook and bootstrap settings may be absent, but a
partly configured provider fails verification. The production profile additionally
requires every privacy-notice value and refuses `ENABLE_UAT_DATABASE_RESET=true`.
The report prints variable names and readiness only; it never prints values.

After Vercel deploys an approved commit, verify that the exact Git `HEAD`, deployment
cell and function region are live on the configured `APP_ROOT_DOMAIN`:

```bash
npm run verify:release -- --runtime-region <vercel-region-code>
```

For the current cells, use `hnd1` for staging and `lhr1` for UK production. The
command reads the expected URL, cell and configured region from the current deployment
environment and reads the approved SHA from local Git. It fails if `/api/version`, its
deployment headers or its no-cache policy do not match. CI can supply
`EXPECTED_VERCEL_RUNTIME_REGION`, `EXPECTED_VERCEL_ENV` and `RELEASE_GIT_SHA` instead.

Start development:

```bash
npm run dev
```

Open:

- Customer order page: `http://localhost:3000/order`
- Ordering-point QR customer order page: `http://localhost:3000/order?qr=your-ordering-point-qr-slug`
- Customer order status page: `http://localhost:3000/order/status?qr=your-ordering-point-qr-slug`
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

- There is no hidden default company or restaurant. The SaaS owner creates companies, then company users create restaurants. Each restaurant receives a default ordering point for customer routing.
- Protected staff routes resolve the active company or restaurant from the signed-in user membership.
- Restaurant-level tenant admin APIs are protected by role checks and scoped to the signed-in membership.
- `/platform`, `/company` and `/restaurant` are role-protected SaaS admin route shells.
- Platform/company admin users authenticate through organization memberships; ordering points never grant staff access.
- Direct staff creation is implemented; restaurant staff invitation links are implemented; email delivery is still planned.
- Membership switching validates active memberships before updating the session.
- Invitation tokens are stored as hashes and expire after 7 days.
- Dashboard summaries are scoped by platform/company access before returning counts.
- Audit logs are scoped by the signed-in user's role and tenant context before they are shown or exported.
- MVP rate limiting is currently in-memory per server instance; use Redis/Upstash or another shared store before serious production traffic.
- Public customer routes resolve a restaurant from its customer domain, route slug or an ordering-point QR slug using `?qr=...`.
- Customer orders created from plain `/order` require a mapped customer domain, restaurant route, ordering-point QR slug or signed-in restaurant context.
- Inventory records are scoped by restaurant and linked to menu products.
- Inventory quantities are deducted when a staff user marks an order item delivered. Products with stock tracking disabled are ignored.
- Order creation validates tracked stock on the server before accepting the order.
- Order numbers are unique per restaurant and order date, so each restaurant gets its own daily sequence.
