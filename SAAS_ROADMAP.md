# Foodie SaaS Pending Roadmap

This file tracks only pending work from the SaaS roadmap. Completed phase history has been removed so future sessions can quickly decide what to do next.

## Current Position

Foodie has working SaaS foundations for:

- Platform, company, restaurant and operations roles.
- Company, restaurant, ordering-point and staff management.
- Invitation-link onboarding.
- Tenant-scoped menus, orders, inventory and reports.
- Audit logs, rate limiting foundation and structured logging.
- Domain records, company subdomain foundation and custom domain mapping UI.
- Universal customer social login with encrypted company overrides and restaurant inheritance or override.

## Immediate Decision

Choose the next track:

- **UAT hardening:** test and stabilize the current app before adding more major features.
- **Production readiness:** add infrastructure items needed before real customers.
- **Domain deployment:** test `foodie.leigia.com`, company subdomains and custom domain routing on Vercel.

## Phase 3 Pending: Tenant Admin

- [ ] Add real email delivery for invitation links.

Notes:

- Current invite flow generates copyable links.
- Customer OTP delivery supports platform, company and restaurant SMTP2GO settings; invitation emails still need to be wired to the shared delivery service.
- Until email is added, admins can manually copy and share invite links.

## Phase 5 Pending: Reporting

- [ ] Add PDF export for reports.

Notes:

- CSV export already exists.
- PDF can wait unless customers specifically need printable reports.

## Phase 6 Pending: Commercial Layer

- [ ] Build a guided tenant onboarding flow.

Notes:

- Plans, trials, subscription statuses, suspension handling and export workflows exist.
- The missing part is a polished first-run flow for setting up a new company, restaurant, staff, ordering point and menu.

## Phase 8 Pending: Domains And Routing

- [ ] UAT test platform domain routing.
- [ ] UAT test company subdomain routing.
- [ ] UAT test restaurant selection and ordering-point routing on a company domain.
- [ ] UAT test custom domain ordering.
- [ ] Verify that staff/admin paths on customer domains always redirect to the platform domain.
- [ ] Add Vercel domain registration automation after manual Vercel domain mapping is tested.

Notes:

- Main SaaS domain target: `foodie.leigia.com`.
- Company customer-domain target: `{company}.foodie.leigia.com`.
- Custom domains should initially target customer ordering/status, not staff/admin login.
- Staff/admin login should stay on `foodie.leigia.com` until custom-domain auth is intentionally hardened.

## Production Readiness TODOs

- [ ] Add compliance controls for SaaS owner audit-log access: log audit-log views/exports, avoid sensitive metadata, document platform support access in privacy/customer terms and later consider a reason-required support access mode.
- [ ] Expand automated tenant-isolation coverage to menu, inventory, orders and reports.
- [ ] Add automated tests for order transitions.
- [ ] Replace in-memory rate limiting with Redis, Upstash or another shared store.
- [ ] Consider Supabase Row Level Security as defense in depth.
- [ ] Add database backup and restore plan.
- [ ] Replace constant polling with Supabase Realtime or adaptive polling before heavier traffic.
- [ ] Add tenant-scoped image uploads and storage limits when image upload storage is introduced.
- [ ] Review server logs and monitoring approach for production.
- [ ] Review Vercel environment variables and deployment settings before live UAT.

## Code Health And Maintainability TODOs

These items come from a project-wide maintainability scan. The app is functional, but several modules have grown large enough that future work will become slower and riskier unless we extract shared patterns.

### High Priority

- [ ] Split `lib/saas-admin.ts` into focused services: platform companies, company restaurants, company users/memberships, domains and reassignment.
- [ ] Split `lib/saas-reports.ts` into report query modules by concern: summaries, status/product reports, timing/cancellation/revenue reports and CSV export.
- [ ] Review the remaining QR slug availability fetch after tests cover live validation behavior.
- [ ] Extend shared money/price formatting into reports and any remaining price displays.
- [ ] Add automated tests for tenant isolation before refactoring route handlers or data services.
- [ ] Add automated tests for order workflow transitions before changing order board or customer status behavior.

### Medium Priority

- [ ] Split `components/order/OrderForm.tsx` into smaller components/hooks: menu loading, category navigation, cart drawer, review screen and cart item state.
- [ ] Split `components/staff/MenuManager.tsx` into smaller components/hooks: category actions, product form, import/export, seed/clear actions and product cards.
- [ ] Split `components/staff/InventoryManager.tsx` into shared inventory form/card components after tests cover inventory save behavior.
- [ ] Consolidate create/edit form patterns for company, restaurant, ordering point, subscription, staff and access forms.
- [ ] Create reusable route/action helpers so submit/cancel/back behavior consistently returns to the nearest workflow context.
- [ ] Create shared status badge components for tenant status, subscription status, user account status, membership access status, order status and item status.
- [ ] Review route handlers for repeated auth, validation, audit logging and JSON error-response code; extract safe wrappers only after tests are in place.
- [ ] Replace remaining route-specific page copy/paste with small server page helpers where it improves clarity without hiding permissions.

### Lower Priority

- [ ] Review whether `components/admin/TenantAdminForms.tsx` should be split into one file per form.
- [ ] Review whether shadcn wrappers under `components/ui` need local documentation for allowed variants and styling rules.
- [ ] Expand architecture notes when brand/reporting groups or multi-ordering-point administration are introduced.
- [ ] Consider moving report CSV export formatting into a separate `lib/reports/export.ts` module.
- [ ] Consider moving menu CSV import/export into separate `lib/menu/import-export.ts` once menu tests exist.

### Observed Hotspots

- `lib/saas-admin.ts` still mixes platform, company, restaurant, user, domain and reassignment logic.
- `lib/saas-reports.ts` is about 1,031 lines and mixes query construction, aggregation and CSV export.
- `components/staff/MenuManager.tsx` is about 860 lines and owns too many UI states and actions.
- `components/order/OrderForm.tsx` is about 768 lines and mixes menu loading, cart state, sticky category behavior, review flow and order submission.
- `components/admin/TenantAdminForms.tsx` is about 483 lines and contains several independent forms.
- The app has many repeated `fetch -> json -> get error -> toast -> pending state` patterns.
- The app has many repeated role/context checks in API routes; these are correct but verbose and should be wrapped carefully after tests.

## UAT Checklist To Create Or Update

- [ ] SaaS owner creates a company.
- [ ] SaaS owner invites company owner.
- [ ] Company owner creates restaurants.
- [ ] Company owner manages all company users at `/company/users`.
- [ ] Company owner invites restaurant manager and order operator.
- [ ] Invited users accept links and log in.
- [ ] Restaurant manager manages menu, inventory and ordering-point settings.
- [ ] Order operator sees only permitted operations.
- [ ] Customer opens ordering link through a customer domain, restaurant route or ordering-point QR slug.
- [ ] Customer places multi-item order.
- [ ] Staff processes item-level order workflow.
- [ ] Customer sees standalone order status page.
- [ ] Reports and audit logs show scoped data only.
- [ ] Disabled/suspended tenants cannot access protected flows.

## Suggested Next Order

1. Run UAT using the current local/Vercel app.
2. Fix UAT bugs before adding new large features.
3. Test manual Vercel domain mapping for `foodie.leigia.com` and one company subdomain.
4. Add email delivery for invitations.
5. Add Redis/Upstash rate limiting.
6. Add automated tenant isolation and order workflow tests.
7. Continue refactoring shared JSON request/form utilities before adding another large admin surface.
8. Decide whether PDF export or guided onboarding is more important for first real users.

## Notes For Future Chat Sessions

- Keep this file pending-only.
- Move completed items out of this file once finished.
- Do not add hard-delete flows for users or companies while orders and audit logs reference them.
- Prefer disabling access/tenants over deleting history.
- Continue using shared shadcn/Tailwind components from `components/ui` and shared wrappers before adding custom UI.
- Use `npm run db:migrate` for normal migration application.
- Use `npm run db:reset:migrate` only for intentional clean development resets.
- Avoid relying on `npm run db:push` while Drizzle introspection remains unreliable against the current Supabase schema.
- Run `npm run lint` and `npm run build` after implementation work.
