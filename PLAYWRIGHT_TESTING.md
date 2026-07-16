# Playwright Testing Guide

This project uses Playwright for browser-based end-to-end checks against the
staging deployment.

Use these tests for staging/UAT confidence before promoting changes to
production. Do not run mutation tests against production.

## What Playwright Tests

The first test suite covers:

- Staff login failure message.
- SaaS owner login.
- Inline validation on the platform company form.
- Optional company creation on staging, disabled by default.
- Optional menu-manager validation checks when manager credentials are provided.
- Optional tenant-isolation checks for restaurant managers with access to more
  than one restaurant.

The tests live in:

- `tests/e2e/platform.spec.ts`
- `tests/e2e/menu-validation.spec.ts`
- `tests/e2e/tenant-isolation.spec.ts`
- `tests/e2e/helpers.ts`

## One-Time Setup

Install dependencies from the repository root:

```powershell
npm install
```

Install the Chromium browser used by Playwright:

```powershell
npx playwright install chromium
```

## Basic Staging Run

Run these commands in PowerShell from the project root:

```powershell
$env:PLAYWRIGHT_BASE_URL="https://foodie-staging.leigia.com"
$env:E2E_PLATFORM_USERNAME="owner"
$env:E2E_PLATFORM_PASSWORD="choose-a-local-password"
npm run test:e2e
```

This runs the safe non-mutating checks by default. It should not create company,
restaurant, menu, or order records.

## Run With Browser Visible

Use headed mode when you want to watch the browser click through the app:

```powershell
$env:PLAYWRIGHT_BASE_URL="https://foodie-staging.leigia.com"
$env:E2E_PLATFORM_USERNAME="owner"
$env:E2E_PLATFORM_PASSWORD="choose-a-local-password"
npm run test:e2e:headed
```

## Interactive Playwright UI

Use the Playwright UI to run individual tests, inspect traces, and debug:

```powershell
$env:PLAYWRIGHT_BASE_URL="https://foodie-staging.leigia.com"
$env:E2E_PLATFORM_USERNAME="owner"
$env:E2E_PLATFORM_PASSWORD="choose-a-local-password"
npm run test:e2e:ui
```

## Mutation Tests

Mutation tests create or update staging data. They are skipped unless this flag
is set:

```powershell
$env:E2E_RUN_MUTATIONS="1"
```

Example full mutation run:

```powershell
$env:PLAYWRIGHT_BASE_URL="https://foodie-staging.leigia.com"
$env:E2E_PLATFORM_USERNAME="owner"
$env:E2E_PLATFORM_PASSWORD="choose-a-local-password"
$env:E2E_RUN_MUTATIONS="1"
npm run test:e2e
```

Only use this on staging.

## Menu Manager Tests

Menu-manager tests need a manager user with access to a restaurant. Staff and
administration always use the platform root domain, so the manager base URL
must point to that domain:

```powershell
$env:PLAYWRIGHT_BASE_URL="https://foodie-staging.leigia.com"
$env:E2E_MANAGER_BASE_URL="https://foodie-staging.leigia.com"
$env:E2E_MANAGER_USERNAME="manager-username"
$env:E2E_MANAGER_PASSWORD="manager-password"
npm run test:e2e
```

If `E2E_MANAGER_BASE_URL` is not set, the tests use `PLAYWRIGHT_BASE_URL`. If
the credentials are not set, menu-manager tests are skipped.

If the same login has multiple access contexts, the test will switch to a
`RESTAURANT MANAGER` context automatically. To target a specific
restaurant, set:

```powershell
$env:E2E_MANAGER_CONTEXT="Snack Shack - Webmly Fast food"
```

Use an account that has restaurant manager access. A company-owner-only account
will land on the company dashboard and the menu-manager test will fail because
the add-on controls are not available there.

## Tenant Isolation Tests

Tenant-isolation tests need one restaurant manager who has access to two
restaurants. They run on the platform root domain and confirm that switching
the active membership changes the tenant-admin snapshot to the selected
restaurant. They also reject a membership the user does not own.

```powershell
$env:PLAYWRIGHT_BASE_URL="https://foodie-staging.leigia.com"
$env:E2E_ISOLATION_BASE_URL="https://foodie-staging.leigia.com"
$env:E2E_ISOLATION_FIRST_CONTEXT="All Go Online"
$env:E2E_ISOLATION_SECOND_CONTEXT="Dominos"
$env:E2E_ISOLATION_USERNAME="user-with-both-access"
$env:E2E_ISOLATION_PASSWORD="user-password"
npm run test:e2e -- tests/e2e/tenant-isolation.spec.ts
```

If these variables are not set, tenant-isolation tests are skipped.

## Useful Commands

List all tests without running the browser:

```powershell
npx playwright test --list
```

Run only platform tests:

```powershell
npx playwright test tests/e2e/platform.spec.ts
```

Run one test by name:

```powershell
npx playwright test --grep "inline validation"
```

Open the latest HTML report:

```powershell
npx playwright show-report
```

## Reports And Artifacts

Playwright may create:

- `playwright-report/`
- `test-results/`

These are ignored by Git and should not be committed.

## Safety Notes

- Keep credentials in PowerShell environment variables only.
- Do not commit passwords or secrets.
- Run tests against `foodie-staging.leigia.com`, not production.
- Keep mutation tests disabled unless you intentionally want staging records to
  be created.
