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

The tests live in:

- `tests/e2e/platform.spec.ts`
- `tests/e2e/menu-validation.spec.ts`
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

Menu-manager tests need a manager user with access to a restaurant/location.
Set these variables before running:

```powershell
$env:PLAYWRIGHT_BASE_URL="https://foodie-staging.leigia.com"
$env:E2E_MANAGER_USERNAME="manager-username"
$env:E2E_MANAGER_PASSWORD="manager-password"
npm run test:e2e
```

If these variables are not set, menu-manager tests are skipped.

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
