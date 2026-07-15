# Restaurant Model Refactor

## Target Hierarchy

```text
Platform
Company
Restaurant
Ordering point
```

- A company is the commercial tenant and owns the subscription and inherited defaults.
- A restaurant is an operational outlet and owns staff access, customers, menus, inventory, orders, payments and reporting.
- An ordering point is optional routing metadata for a general QR link, table or counter. It is not a tenant or staff access scope.
- Optional brand or reporting groups can be added later without becoming a mandatory tenant level.

## Migration Invariants

- Every operational record must resolve to exactly one restaurant organization.
- Company-wide access must be explicit and must not weaken restaurant isolation.
- Ordering points must belong to restaurant organizations.
- Customer profiles remain restaurant-scoped.
- Staff and administration remain on the deployment root domain.
- Customer domains may resolve to a company restaurant picker or directly to a restaurant.
- Legacy location columns remain until all runtime reads and writes have moved away from them.

## Implementation Phases

1. Add the restaurant-owned ordering-point foundation alongside locations.
2. Simplify onboarding, restaurant administration, staff access and plan limits.
3. Move orders, menus, inventory, QR routing and reporting to restaurant scope.
4. Restrict customer domains and integration inheritance to company or restaurant scope.
5. Remove legacy location schema, routes, UI and compatibility code.
6. Audit for leftovers and conflicts, then run full tenant, auth, payment and ordering verification.

## Phase 1

- [x] Add restaurant-owned ordering points.
- [x] Add an optional ordering-point reference to orders.
- [x] Backfill existing location QR records as ordering points.
- [x] Preserve the existing runtime until later phases move behavior.

## Phase 2

- [x] Make company onboarding create restaurants directly.
- [x] Scope restaurant managers and operators to restaurants instead of locations.
- [x] Manage staff directly from each restaurant.
- [x] Enforce restaurant and user limits from the company subscription.
- [x] Hide legacy location administration behind compatibility redirects.
- [x] Keep one internal compatibility location per restaurant until Phase 3.
