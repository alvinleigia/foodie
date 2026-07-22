import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  environmentVariableInventory,
  formatEnvironmentReport,
  inspectEnvironment,
  parseEnvironmentArguments,
} from "../scripts/environment-inventory.mjs";

function completeEnvironment(overrides = {}) {
  return {
    APP_ROOT_DOMAIN: "foodie-staging.example.test",
    AUTH_GOOGLE_ID: "google-client.apps.googleusercontent.com",
    AUTH_GOOGLE_SECRET: "google-client-secret-without-placeholder",
    AUTH_SECRET: "a".repeat(48),
    AUTH_TRUST_HOST: "true",
    CUSTOMER_PHONE_VERIFICATION_PROVIDER: "disabled",
    CUSTOMER_PHONE_VERIFICATION_REQUIRED: "false",
    DATABASE_URL: "postgresql://user:password@database.example.test:5432/postgres",
    DEPLOYMENT_CELL_ID: "uk-uat-1",
    DEPLOYMENT_REGION: "UK-UAT",
    EMAIL_FROM: "Foodie Orders <orders@foodie.test>",
    ENABLE_UAT_DATABASE_RESET: "true",
    EXPECTED_VERCEL_ENV: "production",
    EXPECTED_VERCEL_RUNTIME_REGION: "hnd1",
    NEXT_PUBLIC_DEFAULT_CURRENCY: "GBP",
    NEXT_PUBLIC_DEFAULT_LOCALE: "en-GB",
    NEXT_PUBLIC_DEFAULT_TIMEZONE: "Europe/London",
    OPERATIONAL_ALERT_EMAIL: "alerts@foodie.test",
    SMTP2GO_API_KEY: "api-valid-key-without-placeholder",
    STRIPE_CONNECT_WEBHOOK_SECRET: "whsec_valid_signing_secret",
    STRIPE_SECRET_KEY: "sk_test_valid_secret_key",
    TENANT_CREDENTIALS_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
    ...overrides,
  };
}

const privacyEnvironment = {
  PRIVACY_CONTROLLER_ADDRESS: "1 Restaurant Street, London",
  PRIVACY_CONTROLLER_EMAIL: "privacy@restaurant.test",
  PRIVACY_CONTROLLER_LEGAL_NAME: "Restaurant Limited",
  PRIVACY_INTERNATIONAL_TRANSFERS: "UK processors with approved safeguards",
  PRIVACY_NOTICE_EFFECTIVE_DATE: "22 July 2026",
  PRIVACY_PLATFORM_ADDRESS: "1 Platform Street, London",
  PRIVACY_PLATFORM_EMAIL: "privacy@foodie.test",
  PRIVACY_PLATFORM_ICO_NUMBER: "Not applicable during UAT",
  PRIVACY_PLATFORM_LEGAL_NAME: "Foodie Limited",
  PRIVACY_RETENTION_AUTH: "30 days after expiry",
  PRIVACY_RETENTION_MARKETING: "Until consent is withdrawn",
  PRIVACY_RETENTION_ORDERS: "7 years",
  PRIVACY_RETENTION_PROFILE: "2 years after last activity",
  PRIVACY_RETENTION_SECURITY: "1 year",
};

test("accepts a complete staging launch environment without exposing secrets", () => {
  const secret = "api-valid-key-without-placeholder";
  const report = inspectEnvironment({
    env: completeEnvironment({ SMTP2GO_API_KEY: secret }),
    profile: "staging",
  });
  const output = formatEnvironmentReport(report);

  assert.equal(report.errors.length, 0);
  assert.equal(report.warnings.length, 1);
  assert.match(output, /SMTP2GO_API_KEY/);
  assert.doesNotMatch(output, new RegExp(secret));
  assert.match(output, /No environment variable values were printed/);
});

test("production blocks UAT reset and incomplete privacy configuration", () => {
  const report = inspectEnvironment({
    env: completeEnvironment({
      PRIVACY_PLATFORM_LEGAL_NAME: "replace-before-public-launch",
    }),
    profile: "production",
  });

  assert.ok(
    report.errors.some(
      (issue) =>
        issue.name === "ENABLE_UAT_DATABASE_RESET" &&
        issue.message.includes("must be false"),
    ),
  );
  assert.ok(
    report.errors.some(
      (issue) =>
        issue.name === "PRIVACY_PLATFORM_LEGAL_NAME" &&
        issue.message.includes("placeholder"),
    ),
  );
});

test("accepts an approved production environment", () => {
  const report = inspectEnvironment({
    env: completeEnvironment({
      ...privacyEnvironment,
      ENABLE_UAT_DATABASE_RESET: "false",
      EXPECTED_VERCEL_RUNTIME_REGION: "lhr1",
    }),
    profile: "production",
  });

  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.warnings, []);
});

test("rejects partial optional providers and an impossible phone policy", () => {
  const report = inspectEnvironment({
    env: completeEnvironment({
      AUTH_APPLE_ID: "apple-services-id-value",
      CUSTOMER_PHONE_VERIFICATION_REQUIRED: "true",
      TWILIO_ACCOUNT_SID: `AC${"1".repeat(32)}`,
    }),
    profile: "staging",
  });

  assert.ok(report.errors.some((issue) => issue.name === "AUTH_APPLE_SECRET"));
  assert.ok(report.errors.some((issue) => issue.name === "TWILIO_AUTH_TOKEN"));
  assert.ok(
    report.errors.some(
      (issue) =>
        issue.name === "CUSTOMER_PHONE_VERIFICATION_PROVIDER" &&
        issue.message.includes("cannot be required"),
    ),
  );
});

test("parses only an explicit staging or production profile", () => {
  assert.deepEqual(parseEnvironmentArguments(["--profile=staging"]), {
    profile: "staging",
  });
  assert.deepEqual(parseEnvironmentArguments(["--profile", "production"]), {
    profile: "production",
  });
  assert.throws(() => parseEnvironmentArguments([]), /--profile/);
  assert.throws(
    () => parseEnvironmentArguments(["--profile", "development"]),
    /--profile/,
  );
});

test("inventory includes every direct production process.env reference", () => {
  const inventoryNames = new Set(
    environmentVariableInventory.map((entry) => entry.name),
  );
  const sourceFiles = ["auth.ts"];

  function collectSourceFiles(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        collectSourceFiles(fullPath);
      } else if (/\.(?:ts|tsx)$/.test(entry.name)) {
        sourceFiles.push(fullPath);
      }
    }
  }

  collectSourceFiles("app");
  collectSourceFiles("lib");

  const referencedNames = new Set();

  for (const filePath of sourceFiles) {
    const source = fs.readFileSync(filePath, "utf8");

    for (const match of source.matchAll(/process\.env\.([A-Z0-9_]+)/g)) {
      referencedNames.add(match[1]);
    }
  }

  const missingNames = [...referencedNames].filter(
    (name) => !inventoryNames.has(name),
  );

  assert.deepEqual(missingNames, []);
});
