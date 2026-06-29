# Foodie SaaS Roadmap

This file is the persistent implementation tracker for turning the current single-location Foodie POS MVP into a multi-tenant SaaS platform.

Use this file as the starting point in future chat sessions. Before implementing a phase, review the current schema in `db/schema.ts`, order helpers in `lib/orders.ts`, and the active UI in `components/`.

## Current Product Snapshot

- The app is currently a working MVP for one bar/location.
- Customers can place multi-item orders without login.
- Staff log in with database-backed accounts created through admin/invite flows.
- Staff can manage menu categories and products.
- Orders support item-level preparation, ready, delivered, cancelled and announcement actions.
- Customer order history is stored locally on the customer device and synced with server order status.
- Database is Supabase/Postgres via Drizzle.
- UI uses shadcn-style reusable components under `components/ui`.

## Target SaaS Model

```text
Platform / SaaS Owner
  -> Parent Company / Company Tenant
       -> Restaurant / Brand / Child Tenant
            -> Locations / Bars
            -> Staff Users
            -> Menus
            -> Orders
       -> Company Dashboard / Reports
```

The future app must support:

- Platform admins managing all tenants.
- Parent companies managing child restaurants/brands.
- Restaurant managers managing locations, staff, menus and operations.
- Order operators seeing only assigned location orders.
- Parent companies viewing summary reports across child restaurants.
- Restaurant/location dashboards for local reporting.

## Domain Strategy

Canonical hosting approach:

- Main SaaS/platform app runs on `foodie.leigia.com`.
- Each parent company gets one company subdomain such as `{company}.foodie.leigia.com`.
- Company subdomains carry the company workspace, child restaurants, locations, public ordering and customer order status.
- Restaurants and locations should not require separate subdomains by default; they should be resolved inside the company subdomain using restaurant/location slugs or QR/menu slugs.
- Custom client domains can be added later and should initially map to public ordering/status for a company or location before expanding into admin surfaces.
- The app should keep `foodie.leigia.com` as the safest staff/admin login surface until custom-domain Auth.js cookie behavior is intentionally hardened.

Target examples:

- Platform admin: `https://foodie.leigia.com/platform`
- Company dashboard: `https://alvin.foodie.leigia.com/company`
- Restaurant admin: `https://alvin.foodie.leigia.com/restaurant/kfc-panaji`
- Location ordering: `https://alvin.foodie.leigia.com/order/panaji-lobby`
- Future custom ordering domain: `https://orders.clientdomain.com`

Planned domain data model:

- `tenant_domains.domain`
- `tenant_domains.scope`: `PLATFORM`, `COMPANY`, `RESTAURANT` or `LOCATION`
- `tenant_domains.purpose`: `ADMIN`, `ORDERING` or `BOTH`
- `tenant_domains.company_id`
- `tenant_domains.restaurant_id`
- `tenant_domains.location_id`
- `tenant_domains.is_primary`

## UI Standards

- Primary cross-route navigation must live in the global `AppHeader` account dropdown.
- Avoid duplicate page-level route switchers for shared modules such as Operations Orders and Menu Manager.
- Page-level buttons should be action-specific only, such as add, edit, invite, save, cancel or clear.
- Reuse shadcn/Tailwind components from `components/ui` and shared app wrappers before adding one-off UI.
- Timezone and currency fields should use shared dropdowns backed by `data/timezones.json` and `data/currencies.json`, not manual text inputs.
- Focused create/edit/action routes must receive a route-owned `backHref` or safe `returnTo`; submit, cancel and back actions should return to the nearest parent workflow instead of a generic dashboard.

## Phase 1: Core SaaS Data Model

Status: Foundation implemented; move to Phase 2 next. Inventory scope is intentionally deferred until the inventory module exists.

Goal: Add the tenant hierarchy before more UI expansion so tenancy is not retrofitted later.

Tasks:

- [x] Add `organizations` table.
- [x] Support organization hierarchy with `parentOrganizationId`.
- [x] Decide organization types: `COMPANY` and `RESTAURANT` for Phase 1. Platform admin remains a role, not an organization type yet.
- [x] Add `locations` table for restaurants, bars, event counters or branches.
- [x] Add `memberships` table linking users to organizations and roles.
- [x] Add `organizationId` and `locationId` to operational records for menu categories, menu items, orders and order items.
- [x] Scope menu categories/items by organization and location through `lib/menu.ts` and menu API routes.
- [x] Scope orders and order items by organization and location through `lib/orders.ts` and order API routes.
- [x] Scope inventory by organization and location.
- [x] Add tenant-aware indexes for common queries.
- [x] Create migration file `drizzle/0003_saas_core_tenant_foundation.sql`.
- [x] Backfill existing MVP records into a hidden default company, restaurant and location in the migration.
- [x] Add verification script `npm run db:verify:tenant` to check default tenant/location and missing tenant scope.

Key decision:

- The current app should become “one location inside one tenant”, not the whole system.

Implementation notes:

- Platform organization ID: `00000000-0000-0000-0000-000000000000`.
- No default company, restaurant or location should be seeded. SaaS owners create real companies, company users create restaurants, and restaurant/company users create locations.
- Schema additions are in `db/schema.ts`.
- Backfill migration is in `drizzle/0003_saas_core_tenant_foundation.sql`.
- Tenant resolver is in `lib/tenant-context.ts`; public ordering requires a QR slug, location route/domain context, or signed-in location access.
- `PLATFORM_ADMIN` access belongs to the platform organization, not to a hidden company tenant.
- Migration `drizzle/0014_platform_membership_cleanup.sql` deduplicates memberships where `location_id` is null, moves platform admins to the platform organization, and removes old seeded default tenant rows.
- Supabase migration `0003_saas_core_tenant_foundation.sql` has been applied.
- Tenant foundation verification passed with `npm run db:verify:tenant`.
- Inventory is now designed as a Phase 4 module and scoped by `organizationId` and `locationId`.
- Next recommended implementation step is Phase 2: replace environment-based staff login with database-backed users, roles, memberships and tenant/location access checks.

## Phase 2: Auth, Roles And Access Control

Status: Core auth/access and membership-based context switching are implemented. User invitation flow is deferred to Phase 3 tenant admin UI.

Goal: Replace environment-based staff access with real user accounts, roles and tenant permissions.

Tasks:

- [x] Replace environment staff login with database-backed users. Only the first SaaS owner is bootstrapped from `.env.local`.
- [x] Keep Auth.js as the auth layer unless there is a strong reason to change.
- [x] Add password hashing and credential validation with Node `scrypt`.
- [x] Add roles such as `PLATFORM_ADMIN`, `COMPANY_OWNER`, `COMPANY_MANAGER`, `RESTAURANT_MANAGER`, `ORDER_OPERATOR`.
- [x] Resolve active organization/location from the signed-in session and membership.
- [x] Add a membership context switcher for users who can access multiple companies, restaurants or locations.
- [x] Ensure server routes never trust tenant/location IDs from the browser without membership checks.
- [ ] Add invitation flow for adding staff/users. Deferred to Phase 3 tenant admin UI.
- [x] Add user states: invited, active, disabled.
- [x] Add server utilities such as `requireLocationAccess` and `requireRole`.

Security rule:

- Every protected query must be scoped by a trusted `organizationId` and, where relevant, `locationId`.

Implementation notes:

- Staff authentication now validates against the `users` table and active `memberships`.
- Password hashes use the format `scrypt:<salt>:<hash>`.
- Auth.js JWT/session now carries `role`, `organizationId`, `locationId`, and `username`.
- Auth.js session updates validate active memberships before switching role, organization and optional location context.
- `getCurrentTenantContext()` resolves tenant/location from the signed-in user session; public unauthenticated routes still use the default MVP tenant context.
- Migration is in `drizzle/0004_database_staff_auth.sql`.

## Phase 3: Tenant Admin UI

Status: SaaS admin route shells, restaurant-level foundation, platform/company tenant CRUD, invitation-based staff onboarding, membership-based location switching, summary cards, first drill-down reporting, logo/QR settings, audit logs, and staff invitation onboarding are implemented. Email delivery and tests are still pending.

Goal: Build the management surfaces for platform admins, parent companies and restaurants.

Tasks:

- [x] Add dedicated SaaS admin route shells for `/platform`, `/company` and `/restaurant`.
- [x] Platform dashboard for SaaS owner health and reporting.
- [x] Dedicated `/platform/companies` route for parent company CRUD and actions.
- [x] Parent company dashboard to create/manage child restaurants.
- [x] Restaurant dashboard foundation inside `/restaurant`.
- [x] User management UI to create staff, assign roles and deactivate memberships.
- [x] Cross-tenant staff onboarding for platform-created company users and company-created restaurant users now uses invitation links.
- [x] Platform-level reassignment flow for moving an existing accepted user to another company or restaurant location.
- [x] Restaurant staff invitation links where invited users set their own password.
- [ ] Email delivery for invitation links. Current Phase 3 UI generates copyable links because SMTP is not configured yet.
- [x] Platform/company invitation links.
- [x] Organization settings: name, timezone, currency.
- [x] Organization settings: logo URL.
- [x] Location settings: name, label, active status, timezone.
- [x] Location settings: QR code slug.
- [x] First parent company overview of child restaurant health and activity.
- [x] First platform drill-down report by company tenant.
- [x] First company drill-down report by child restaurant.
- [x] First platform summary cards for tenant, location, staff and order activity.
- [x] Add empty/loading/error states for the restaurant-level tenant admin surface.

Suggested routes:

- `/platform`
- `/platform/companies`
- `/platform/users/reassign`
- `/company`
- `/restaurant`
- `/restaurant/settings`
- `/restaurant/users`
- `/restaurant/locations`

Implementation notes:

- Restaurant-level admin now lives in `/restaurant`; `/staff` is focused on live orders and menu operations.
- Staff/operations naming is now standardized: `/staff` and `/staff/login` are canonical, and `ORDER_OPERATOR` is the operational role.
- Dedicated admin route shells now exist at `/platform`, `/company` and `/restaurant`.
- `/restaurant` uses the restaurant-level admin panel for settings, location and staff access.
- `/platform` is the SaaS owner dashboard for summary cards and company activity reporting.
- `/platform/companies` can list, create, enable and disable company tenants.
- `/platform/users/reassign` can create a new active membership for an existing accepted user and optionally disable their previous active memberships.
- `/company` can list, create, enable and disable child restaurant tenants with a default location.
- `/platform` can create invite links for `COMPANY_OWNER` and `COMPANY_MANAGER` users for a company tenant.
- `/company` can create invite links for `RESTAURANT_MANAGER` and `ORDER_OPERATOR` users for a child restaurant tenant.
- Users with multiple active memberships can switch company, restaurant or location context from the admin/operations header.
- Reassignment changes future access only; historical orders and audit logs remain in their original tenant/location context.
- Shared admin shell/navigation lives in `components/admin/SaasAdminShell.tsx`.
- Shared access role lists live in `lib/role-access.ts`.
- SaaS tenant CRUD services live in `lib/saas-admin.ts`.
- Membership and location access lookup lives in `lib/location-access.ts`.
- Session membership context switching is handled by `app/api/session/memberships/route.ts` and Auth.js `unstable_update`.
- Legacy session location switching remains in `app/api/session/locations/route.ts` while the UI uses the membership-aware switcher.
- Platform/company dashboard summaries are served by `app/api/platform/summary` and `app/api/company/summary`.
- Reporting summary helpers live in `lib/saas-reports.ts`.
- Platform reports now include company-level breakdowns for restaurants, locations, staff, active orders, non-cancelled orders, cancelled orders and last order time.
- Company reports now include child restaurant breakdowns for locations, staff, active orders, non-cancelled orders, cancelled orders and last order time.
- Platform/company admin users can sign in without a location-level membership; operational routes still require a location context.
- New server helpers are in `lib/tenant-admin.ts`.
- Validation schemas are in `lib/validations/tenant-admin.ts`.
- Tenant admin API routes are under `app/api/tenant/admin`.
- Restaurant admin can save an organization logo URL and location QR/menu slug.
- Migration `drizzle/0007_location_qr_slug.sql` adds `locations.qr_slug`.
- The QR slug UI currently produces `/order?qr=...`; full public tenant resolution by QR slug belongs in Phase 4 with tenant-aware customer order loading.
- Restaurant staff invitations use `staff_invitations`, `app/api/tenant/admin/staff/invite`, `app/api/invitations/accept`, and `/invite`.
- Invitation tokens are stored as hashes and expire after 7 days.
- Migration `drizzle/0006_staff_invitations.sql` adds the invitation token table.
- Tenant and staff management audit logs now live on the dedicated `/audit-logs` route.
- Platform admins can review all user memberships across companies, restaurants and locations at `/platform/users/memberships`.
- The global admin shell uses a membership context switcher so multi-membership users can move between company, restaurant and location access without signing out.

## Phase 4: Operational Modules

Status: Complete for the current MVP scope. Customer QR/location ordering, location-scoped menu/order operations, item-level order workflow, daily location order numbers, inventory tracking and stock safeguards are in place.

Goal: Convert current POS functionality into tenant-aware, reusable modules.

Tasks:

- [x] Refactor current menu manager into tenant/location-aware module.
- [x] Refactor order board into location-aware module.
- [x] Refactor customer order page to load by location QR/link.
- [x] Add QR/menu links per location.
- [x] Add inventory module per restaurant/location.
- [x] Deduct tracked inventory when order items are marked delivered.
- [x] Block public ordering for tracked products with insufficient stock.
- [x] Support out-of-stock or hidden products by location.
- [x] Decide order numbering strategy: daily location sequence.
- [x] Keep item-level order status workflow.
- [x] Add reusable components for order item rows across customer and staff views.

Implementation notes:

- Public customer ordering supports location QR links using `/order?qr=...`.
- Customer order status supports `/order/status?qr=...` and preserves QR context from the order flow.
- Public menu, order creation, customer order status and customer cancellation resolve tenant/location from QR slug for anonymous customers.
- Staff order board and menu manager continue to resolve tenant/location from authenticated membership/session context.
- Location QR slugs are globally unique through the database unique index and save-time server validation.
- `/restaurant/location` now has a live QR slug availability check before saving.
- Existing orders placed before QR routing may belong to the hidden default tenant and will not appear in real restaurant/location staff panels.
- Menu items support `isSoldOut`; public ordering hides/disables sold-out products and menu manager can toggle stock state.
- Inventory is available at `/operations/inventory` for restaurant managers and stores stock per restaurant/location/menu product.
- Migration `drizzle/0009_inventory_items.sql` adds the `inventory_items` table.
- Managers can save quantity, low-stock threshold, unit, tracking state and notes per product.
- Tracked inventory is deducted when an order item is marked delivered; untracked products are ignored.
- Full-order cancellation now also closes child item rows so reporting and inventory assumptions stay aligned.
- Shared order item row UI now lives in `components/shared/OrderLineItemRow.tsx` and is used by staff and customer order status views.
- Order numbers now use a per-organization, per-location, per-business-date sequence instead of one global platform sequence.
- Migration `drizzle/0010_location_daily_order_numbers.sql` adds `orders.order_date`, removes the global `order_no` uniqueness constraint, and creates the scoped unique index.
- `lib/order-number.ts` assigns numbers inside the order creation transaction with a Postgres advisory lock for the location/day.
- Shared order display formatting now lives in `lib/order-display.ts` and is used by customer and staff order cards.
- Public menus include tracked inventory availability for each product.
- Customer ordering shows low-stock badges, disables tracked zero-stock products, and the order API rejects insufficient tracked stock server-side.
- Inventory manager includes admin-facing summary cards for tracked, low-stock, out-of-stock and untracked products.
- Phase 4 can now move into Phase 5 reporting and company dashboards.

Current refactor candidates:

- `components/order/OrderForm.tsx`
- `components/order/CustomerOrderStatus.tsx`
- `components/staff/StaffOrderBoard.tsx`
- `components/staff/OrderCard.tsx`
- `components/staff/MenuManager.tsx`

## Phase 5: Reporting And Company Dashboards

Status: Complete for the current MVP scope. Scoped report service and dashboard panels are implemented for company and restaurant admin views; period filtering, timing, cancellation, revenue and CSV export are in place.

Goal: Give parent companies and restaurants visibility into performance.

Tasks:

- [x] Parent company summary across all child restaurants.
- [x] Restaurant-level reports.
- [x] Location-level reports.
- [x] Orders by date, status, drink, category, location and staff member.
- [x] Prep time and collection/delivery time reports.
- [x] Cancelled/refused item reports.
- [x] Top products and low-performing products.
- [x] Revenue/price reports once pricing is reliable.
- [x] CSV export.
- [ ] Later: PDF export.

Important:

- Reporting should read from tenant-scoped views or service functions, not raw unscoped queries.

Implementation notes:

- Shared reporting service lives in `lib/saas-reports.ts`.
- Company summary API returns scoped operational reports for child restaurants.
- Restaurant summary API returns scoped operational reports for the active restaurant context.
- `components/admin/OperationalReports.tsx` renders reusable report panels for order status, top products, location activity and stock alerts.
- First report slice includes all-time/today status counts, location order activity, top products by quantity and low/out-of-stock alerts.
- Report APIs accept `?range=today|7d|30d|all`.
- Company and restaurant dashboards share report range controls.
- Reports now include selected-period order status, top products, category mix, staff activity and location activity.
- Reports now include average item prep time, average collection time and cancelled item breakdowns for the selected period.
- Revenue reports use priced, non-cancelled item rows only and separately show unpriced rows.
- CSV export endpoints are available at `/api/company/reports/export?range=...` and `/api/tenant/reports/export?range=...`.

## Phase 6: SaaS Commercial Layer

Status: MVP complete. Commercial data model, seeded plans, trial subscriptions, platform commercial metrics, subscription status controls, suspended tenant handling, data export and protected account deletion are in place.

Goal: Add subscription and onboarding capability once product structure is stable.

Tasks:

- [ ] Tenant onboarding flow.
- [x] Plans and billing.
- [x] Usage limits for restaurants, locations, users, orders and storage.
- [x] Trial accounts.
- [x] Subscription status handling.
- [x] Suspended tenant handling.
- [x] Platform-level SaaS metrics.
- [x] Data export and account deletion workflows.

Implementation notes:

- Migration `drizzle/0011_saas_commercial_foundation.sql` adds `saas_plans`, `organization_subscriptions` and `subscription_status`.
- Starter, Growth and Group plans are seeded by migration.
- Existing real company tenants are backfilled onto Starter trial subscriptions.
- New company tenants automatically receive a 14-day Starter trial subscription.
- Platform summary now includes active plans, trialing companies, active subscriptions, suspended subscriptions, cancelled subscriptions and current-month order volume.
- Platform company cards show subscription status, trial end date and plan limits.
- SaaS owner can mark subscriptions active, suspended or cancelled from the platform company actions menu.
- Suspended/cancelled tenants are blocked at login, shared role guards, tenant context resolution, public QR ordering/status, admin shells and operations pages.
- SaaS owner can export company tenant data as JSON from the platform company actions menu.
- Company tenant deletion is intentionally not exposed in the UI; SaaS owners should disable tenants and export data instead of hard-deleting historical users, orders or logs.
- UAT-only database reset lives at `/platform/uat-reset` and `app/api/platform/uat-reset`; it is available only when `ENABLE_UAT_DATABASE_RESET=true` and preserves the current SaaS owner account.
- Payment provider checkout, invoices and hosted billing portal are deferred until real subscription collection is needed.

## Phase 7: Scale, Security And Reliability

Status: MVP complete for the current app layer. Database-backed audit logs, scoped audit APIs, CSV export, dashboard viewing panels, in-memory rate limiting, structured server logging and polling overlap protection are implemented. Production infrastructure items are tracked separately under Production TODOs.

Goal: Make the platform production-ready for multiple customers and heavier usage.

Tasks:

- [x] Add strict server-side tenant guards to current protected routes and APIs.
- [x] Add audit logs for admin, user, menu and order changes.
- [x] Add request cancellation/locking to prevent overlapping polling calls.
- [x] Add rate limiting. MVP in-memory limiting is implemented for public order/customer/invite flows and credential attempts.
- [x] Add structured error logging foundation.

Implementation notes:

- Migration `drizzle/0012_audit_logs.sql` adds `audit_logs` with actor, tenant, location, action, entity and JSON metadata fields.
- Shared audit writer lives in `lib/audit-log.ts`; it writes structured audit rows and logs JSON server errors if audit persistence fails.
- Current audit coverage includes platform company create/update/export, subscription status changes, platform-created company staff invitations, company-created restaurant/location changes and company-created staff invitations.
- Restaurant operational audit coverage includes organization/location settings, direct staff create/update, restaurant staff invitations, menu category/item changes, item sold-out toggles, inventory saves, full-order transitions, item-level transitions, announcements and cancellations.
- Scoped audit APIs are available at `/api/audit-logs` and `/api/audit-logs/export`.
- `components/admin/AuditLogPanel.tsx` renders recent scoped audit logs and CSV export links on the dedicated `/audit-logs` route.
- Platform, company and restaurant dashboards no longer embed audit logs; admins access logs from the global header dropdown.
- Shared MVP rate limiter lives in `lib/rate-limit.ts`.
- Current rate limiting covers public order creation, customer order status polling, customer cancellation, invitation acceptance and credential attempts.
- The current limiter is in-memory per server instance; before serious production traffic, replace the backing store with Redis/Upstash or another shared rate limit store.
- Shared structured logging foundation lives in `lib/logger.ts`; `lib/audit-log.ts` uses it for audit persistence failures.
- Staff order board polling and customer order status polling now abort stale requests before starting the next sync, preventing overlapping refresh calls and stale response wins.

## Phase 8: Domain And Tenant Routing

Status: Foundation in progress. Domain records, company subdomain creation and public order/status location-slug aliases are implemented; custom domain management UI and Vercel automation are still pending.

Goal: Make the SaaS tenant context resolve cleanly from the host name so the platform can run on `foodie.leigia.com` while each company uses `{company}.foodie.leigia.com` for dashboards, restaurants, locations and ordering.

Tasks:

- [x] Add `tenant_domains` table for platform, company, restaurant and location domain records.
- [x] Seed `foodie.leigia.com` as the platform domain in production setup.
- [x] Auto-create a `{company}.foodie.leigia.com` domain record when a company tenant is created.
- [x] Add server-side host/domain resolver that maps incoming host names to company, restaurant and location context.
- [x] Update tenant context helpers to prefer trusted QR/location/domain resolution before falling back to signed-in session or default dev context.
- [x] Keep public ordering on company subdomains using location slugs such as `/order/{locationSlug}` or a compatible route alias.
- [ ] Keep staff/admin login safest on `foodie.leigia.com` until custom-domain Auth.js cookie behavior is explicitly hardened.
- [x] Add custom domain management UI after the core subdomain resolver is stable.
- [ ] Add Vercel domain registration automation only after manual domain mapping is tested.
- [ ] Add UAT cases for platform domain, company subdomain, location ordering and future custom ordering domain.

Important:

- Company subdomain is the primary tenant boundary for the MVP SaaS domain model.
- Restaurants and locations should normally be route-level context inside the company domain, not separate domains.
- Custom domains should initially target customer ordering/status because those flows do not require login.

Implementation notes:

- Preferred examples are `foodie.leigia.com/platform`, `alvin.foodie.leigia.com/company`, `alvin.foodie.leigia.com/restaurant/kfc-panaji` and `alvin.foodie.leigia.com/order/panaji-lobby`.
- Future custom domains such as `orders.clientdomain.com` should point to a company or location ordering scope.
- Migration `drizzle/0013_tenant_domains.sql` adds the tenant domain table and backfills company subdomain records for existing non-default company tenants.
- Domain helper logic lives in `lib/tenant-domains.ts`.
- New public route aliases are `/order/[locationSlug]` and `/order/status/[locationSlug]`; existing `/order?qr=...` and `/order/status?qr=...` continue to work.
- Public APIs now accept `?location=...` in addition to `?qr=...` for company-domain order/menu/status/cancel requests.
- SaaS owners can manage company domain mappings from `/platform/companies/[id]/domains`.
- Custom domain UI stores the Foodie tenant mapping; the domain must still be added to Vercel and pointed by DNS until Vercel API automation is implemented.

Production TODOs:

- [ ] Consider Supabase Row Level Security as defense in depth before production launch.
- [ ] Replace constant polling with Supabase Realtime or adaptive polling before heavier production traffic.
- [ ] Replace in-memory rate limiting with Redis/Upstash or another shared rate limit store.
- [ ] Add automated tests for tenant isolation and order transitions.
- [ ] Add backups and restore plan before production launch.
- [ ] Add tenant-scoped image uploads and storage limits when image upload storage is introduced.

## Recommended Immediate Next Step

Move into Phase 8 or start UAT hardening, depending on whether the next priority is domain readiness or stabilizing the current SaaS flow.

Implementation order:

1. Run UAT against the platform, company, restaurant, operations and public QR order flows.
2. Implement the Phase 8 company subdomain resolver for `foodie.leigia.com` and `{company}.foodie.leigia.com`.
3. Add automated tests for tenant isolation and order transitions.
4. Choose production providers for Redis-backed rate limiting, backups, email delivery and tenant-scoped storage.

## Notes For Future Chat Sessions

- Do not start with billing, reporting or dashboards until Phase 1 tenant foundations exist.
- Do not trust tenant or location IDs sent by the browser without checking session membership.
- Prefer moving business rules out of route handlers into service functions before adding more features.
- Keep migrations backward compatible where possible.
- Use `npm run db:migrate` for normal migration application and `npm run db:reset:migrate` only for intentional clean dev resets.
- Avoid manual Supabase SQL copy-paste for multi-step migrations because enum changes must commit before newly added enum values can be used.
- Avoid relying on `npm run db:push` as the main setup path while Drizzle introspection is failing against the current Supabase schema.
- Run `npm run lint` and `npm run build` after implementation work.
- The user prefers to run `npm` directly in their terminal; internal Windows tool runs may use `npm.cmd`.
