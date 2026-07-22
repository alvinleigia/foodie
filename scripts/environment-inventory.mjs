import { resolveDeploymentConfig } from "./deployment-config.mjs";

const profiles = new Set(["production", "staging"]);
const vercelEnvironments = new Set(["development", "preview", "production"]);
const booleanValues = new Set(["false", "true"]);
const runtimeRegionPattern = /^[a-z]{3}\d$/i;
const fullGitShaPattern = /^[a-f0-9]{40}$/i;

const categories = [
  {
    name: "Deployment cell",
    variables: [
      ["DEPLOYMENT_CELL_ID", false],
      ["DEPLOYMENT_REGION", false],
      ["APP_ROOT_DOMAIN", false],
      ["NEXT_PUBLIC_DEFAULT_LOCALE", false],
      ["NEXT_PUBLIC_DEFAULT_TIMEZONE", false],
      ["NEXT_PUBLIC_DEFAULT_CURRENCY", false],
    ],
  },
  {
    name: "Runtime security",
    variables: [
      ["DATABASE_URL", true],
      ["AUTH_SECRET", true],
      ["AUTH_TRUST_HOST", false],
      ["TENANT_CREDENTIALS_ENCRYPTION_KEY", true],
      ["ENABLE_UAT_DATABASE_RESET", false],
    ],
  },
  {
    name: "Email and operations",
    variables: [
      ["SMTP2GO_API_KEY", true],
      ["EMAIL_FROM", false],
      ["OPERATIONAL_ALERT_EMAIL", false],
    ],
  },
  {
    name: "Customer social login",
    variables: [
      ["AUTH_GOOGLE_ID", false],
      ["AUTH_GOOGLE_SECRET", true],
      ["AUTH_APPLE_ID", false],
      ["AUTH_APPLE_SECRET", true],
      ["AUTH_FACEBOOK_ID", false],
      ["AUTH_FACEBOOK_SECRET", true],
    ],
  },
  {
    name: "Stripe payments",
    variables: [
      ["STRIPE_SECRET_KEY", true],
      ["STRIPE_CONNECT_WEBHOOK_SECRET", true],
      ["STRIPE_WEBHOOK_SECRET", true],
    ],
  },
  {
    name: "Phone verification",
    variables: [
      ["CUSTOMER_PHONE_VERIFICATION_PROVIDER", false],
      ["CUSTOMER_PHONE_VERIFICATION_REQUIRED", false],
      ["TWILIO_ACCOUNT_SID", true],
      ["TWILIO_AUTH_TOKEN", true],
      ["TWILIO_VERIFY_SERVICE_SID", true],
    ],
  },
  {
    name: "Privacy notice",
    variables: [
      ["PRIVACY_NOTICE_EFFECTIVE_DATE", false],
      ["PRIVACY_PLATFORM_ADDRESS", false],
      ["PRIVACY_PLATFORM_EMAIL", false],
      ["PRIVACY_PLATFORM_ICO_NUMBER", false],
      ["PRIVACY_PLATFORM_LEGAL_NAME", false],
      ["PRIVACY_CONTROLLER_ADDRESS", false],
      ["PRIVACY_CONTROLLER_EMAIL", false],
      ["PRIVACY_CONTROLLER_LEGAL_NAME", false],
      ["PRIVACY_INTERNATIONAL_TRANSFERS", false],
      ["PRIVACY_RETENTION_PROFILE", false],
      ["PRIVACY_RETENTION_AUTH", false],
      ["PRIVACY_RETENTION_ORDERS", false],
      ["PRIVACY_RETENTION_SECURITY", false],
      ["PRIVACY_RETENTION_MARKETING", false],
    ],
  },
  {
    name: "Platform bootstrap",
    variables: [
      ["PLATFORM_OWNER_USERNAME", false],
      ["PLATFORM_OWNER_EMAIL", false],
      ["PLATFORM_OWNER_PASSWORD", true],
    ],
  },
  {
    name: "Release verification",
    variables: [
      ["EXPECTED_VERCEL_RUNTIME_REGION", false],
      ["EXPECTED_VERCEL_ENV", false],
      ["RELEASE_GIT_SHA", false],
    ],
  },
  {
    managed: true,
    name: "Host-managed runtime",
    variables: [
      ["NODE_ENV", false],
      ["VERCEL_ENV", false],
      ["VERCEL_GIT_COMMIT_SHA", false],
      ["VERCEL_REGION", false],
    ],
  },
];

export const environmentVariableInventory = Object.freeze(
  categories.flatMap((category) =>
    category.variables.map(([name, secret]) =>
      Object.freeze({
        category: category.name,
        managed: Boolean(category.managed),
        name,
        secret,
      }),
    ),
  ),
);

const launchRequiredVariables = new Set([
  "APP_ROOT_DOMAIN",
  "AUTH_GOOGLE_ID",
  "AUTH_GOOGLE_SECRET",
  "AUTH_SECRET",
  "AUTH_TRUST_HOST",
  "CUSTOMER_PHONE_VERIFICATION_PROVIDER",
  "CUSTOMER_PHONE_VERIFICATION_REQUIRED",
  "DATABASE_URL",
  "DEPLOYMENT_CELL_ID",
  "DEPLOYMENT_REGION",
  "EMAIL_FROM",
  "ENABLE_UAT_DATABASE_RESET",
  "EXPECTED_VERCEL_ENV",
  "EXPECTED_VERCEL_RUNTIME_REGION",
  "NEXT_PUBLIC_DEFAULT_CURRENCY",
  "NEXT_PUBLIC_DEFAULT_LOCALE",
  "NEXT_PUBLIC_DEFAULT_TIMEZONE",
  "OPERATIONAL_ALERT_EMAIL",
  "SMTP2GO_API_KEY",
  "STRIPE_CONNECT_WEBHOOK_SECRET",
  "STRIPE_SECRET_KEY",
  "TENANT_CREDENTIALS_ENCRYPTION_KEY",
]);

const privacyVariables = environmentVariableInventory
  .filter((entry) => entry.category === "Privacy notice")
  .map((entry) => entry.name);

function hasValue(value) {
  return typeof value === "string" && Boolean(value.trim());
}

function normalizedValue(env, name) {
  return hasValue(env[name]) ? env[name].trim() : "";
}

function isPlaceholder(value) {
  const normalized = value.trim().toLowerCase();

  return (
    normalized.includes("...") ||
    normalized.includes("example.com") ||
    normalized.includes("replace-") ||
    normalized.includes("base64-encoded") ||
    normalized === "change-me" ||
    normalized.endsWith("-client-id") ||
    normalized.endsWith("-client-secret")
  );
}

function isEmail(value) {
  const bracketed = value.match(/<([^<>]+)>\s*$/);
  const address = (bracketed?.[1] ?? value).trim();

  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address);
}

function isDatabaseUrl(value) {
  try {
    const url = new URL(value);

    return (
      (url.protocol === "postgres:" || url.protocol === "postgresql:") &&
      Boolean(url.hostname)
    );
  } catch {
    return false;
  }
}

function isValidEncryptionKey(value) {
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(value)) {
    return false;
  }

  return Buffer.from(value, "base64").length === 32;
}

function parseOption(argv, optionName) {
  let value;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === optionName) {
      value = argv[index + 1];
      index += 1;
      continue;
    }

    if (argument.startsWith(`${optionName}=`)) {
      value = argument.slice(optionName.length + 1);
      continue;
    }

    throw new Error(`Unknown environment verification option: ${argument}`);
  }

  return value;
}

export function parseEnvironmentArguments(argv) {
  const profile = parseOption(argv, "--profile")?.trim().toLowerCase();

  if (!profile || !profiles.has(profile)) {
    throw new Error("--profile must be either staging or production.");
  }

  return { profile };
}

export function inspectEnvironment({ env, profile }) {
  if (!profiles.has(profile)) {
    throw new Error("Environment profile must be either staging or production.");
  }

  const errors = [];
  const warnings = [];
  const requiredVariables = new Set(launchRequiredVariables);

  if (profile === "production") {
    for (const name of privacyVariables) {
      requiredVariables.add(name);
    }
  }

  const entries = environmentVariableInventory.map((definition) => {
    const configured = hasValue(env[definition.name]);
    const required = requiredVariables.has(definition.name);

    return {
      ...definition,
      required,
      status: configured
        ? "configured"
        : definition.managed
          ? "host managed"
          : required
            ? "missing"
            : "not configured",
    };
  });
  const entriesByName = new Map(entries.map((entry) => [entry.name, entry]));

  function addError(name, message) {
    if (!errors.some((issue) => issue.name === name && issue.message === message)) {
      errors.push({ message, name });
    }

    const entry = entriesByName.get(name);

    if (entry) {
      entry.status = hasValue(env[name]) ? "invalid" : "missing";
    }
  }

  function addWarning(name, message) {
    if (!warnings.some((issue) => issue.name === name && issue.message === message)) {
      warnings.push({ message, name });
    }
  }

  function requireVariable(name) {
    if (!hasValue(env[name])) {
      addError(name, `${name} is required for the ${profile} launch profile.`);
    }
  }

  function rejectPlaceholder(name) {
    const value = normalizedValue(env, name);

    if (value && isPlaceholder(value)) {
      addError(name, `${name} still contains an example or placeholder value.`);
    }
  }

  function validateBoolean(name) {
    const value = normalizedValue(env, name).toLowerCase();

    if (value && !booleanValues.has(value)) {
      addError(name, `${name} must be true or false.`);
    }
  }

  function validateEmail(name) {
    const value = normalizedValue(env, name);

    if (value && !isEmail(value)) {
      addError(name, `${name} must contain a valid email address.`);
    }
  }

  function validateCompleteGroup(names, label) {
    const configuredNames = names.filter((name) => hasValue(env[name]));

    if (configuredNames.length === 0 || configuredNames.length === names.length) {
      return;
    }

    for (const name of names) {
      if (!hasValue(env[name])) {
        addError(name, `${label} is partly configured; ${name} is missing.`);
      }
    }
  }

  for (const name of requiredVariables) {
    requireVariable(name);
  }

  for (const entry of entries) {
    if (!entry.managed && hasValue(env[entry.name])) {
      rejectPlaceholder(entry.name);
    }
  }

  const deploymentNames = categories[0].variables.map(([name]) => name);

  if (deploymentNames.every((name) => hasValue(env[name]))) {
    try {
      resolveDeploymentConfig(env);
    } catch (error) {
      addError(
        "DEPLOYMENT_CELL_ID",
        error instanceof Error
          ? error.message
          : "Deployment cell configuration is invalid.",
      );
    }
  }

  const databaseUrl = normalizedValue(env, "DATABASE_URL");

  if (databaseUrl && !isDatabaseUrl(databaseUrl)) {
    addError("DATABASE_URL", "DATABASE_URL must be a PostgreSQL connection URL.");
  }

  const authSecret = normalizedValue(env, "AUTH_SECRET");

  if (authSecret && authSecret.length < 32) {
    addError("AUTH_SECRET", "AUTH_SECRET must contain at least 32 characters.");
  }

  const trustHost = normalizedValue(env, "AUTH_TRUST_HOST").toLowerCase();

  if (trustHost && trustHost !== "true") {
    addError("AUTH_TRUST_HOST", "AUTH_TRUST_HOST must be true for the hosted application.");
  }

  const encryptionKey = normalizedValue(env, "TENANT_CREDENTIALS_ENCRYPTION_KEY");

  if (encryptionKey && !isValidEncryptionKey(encryptionKey)) {
    addError(
      "TENANT_CREDENTIALS_ENCRYPTION_KEY",
      "TENANT_CREDENTIALS_ENCRYPTION_KEY must be a base64-encoded 32-byte key.",
    );
  }

  validateEmail("EMAIL_FROM");
  validateEmail("OPERATIONAL_ALERT_EMAIL");
  validateEmail("PLATFORM_OWNER_EMAIL");
  validateEmail("PRIVACY_PLATFORM_EMAIL");
  validateEmail("PRIVACY_CONTROLLER_EMAIL");

  validateCompleteGroup(
    ["AUTH_APPLE_ID", "AUTH_APPLE_SECRET"],
    "Platform Apple login",
  );
  validateCompleteGroup(
    ["AUTH_FACEBOOK_ID", "AUTH_FACEBOOK_SECRET"],
    "Platform Facebook login",
  );
  validateCompleteGroup(
    ["PLATFORM_OWNER_USERNAME", "PLATFORM_OWNER_PASSWORD"],
    "Platform owner bootstrap",
  );

  const stripeKey = normalizedValue(env, "STRIPE_SECRET_KEY");

  if (stripeKey && !/^sk_(?:test|live)_/.test(stripeKey)) {
    addError("STRIPE_SECRET_KEY", "STRIPE_SECRET_KEY must be a Stripe secret key.");
  }

  for (const name of ["STRIPE_CONNECT_WEBHOOK_SECRET", "STRIPE_WEBHOOK_SECRET"]) {
    const value = normalizedValue(env, name);

    if (value && !value.startsWith("whsec_")) {
      addError(name, `${name} must be a Stripe webhook signing secret.`);
    }
  }

  validateBoolean("CUSTOMER_PHONE_VERIFICATION_REQUIRED");
  validateBoolean("ENABLE_UAT_DATABASE_RESET");

  const phoneProvider = normalizedValue(
    env,
    "CUSTOMER_PHONE_VERIFICATION_PROVIDER",
  ).toUpperCase();
  const phoneRequired =
    normalizedValue(env, "CUSTOMER_PHONE_VERIFICATION_REQUIRED").toLowerCase() ===
    "true";
  const twilioNames = [
    "TWILIO_ACCOUNT_SID",
    "TWILIO_AUTH_TOKEN",
    "TWILIO_VERIFY_SERVICE_SID",
  ];

  if (phoneProvider && phoneProvider !== "DISABLED" && phoneProvider !== "TWILIO_VERIFY") {
    addError(
      "CUSTOMER_PHONE_VERIFICATION_PROVIDER",
      "CUSTOMER_PHONE_VERIFICATION_PROVIDER must be disabled or TWILIO_VERIFY.",
    );
  }

  validateCompleteGroup(twilioNames, "Twilio Verify");

  if (phoneProvider === "TWILIO_VERIFY") {
    for (const name of twilioNames) {
      if (!hasValue(env[name])) {
        addError(name, `Twilio Verify is enabled; ${name} is required.`);
      }
    }
  }

  if (phoneRequired && phoneProvider !== "TWILIO_VERIFY") {
    addError(
      "CUSTOMER_PHONE_VERIFICATION_PROVIDER",
      "Phone verification cannot be required unless TWILIO_VERIFY is enabled.",
    );
  }

  const twilioAccountSid = normalizedValue(env, "TWILIO_ACCOUNT_SID");
  const twilioServiceSid = normalizedValue(env, "TWILIO_VERIFY_SERVICE_SID");

  if (twilioAccountSid && !/^AC[a-z0-9]{32}$/i.test(twilioAccountSid)) {
    addError("TWILIO_ACCOUNT_SID", "TWILIO_ACCOUNT_SID has an invalid format.");
  }

  if (twilioServiceSid && !/^VA[a-z0-9]{32}$/i.test(twilioServiceSid)) {
    addError(
      "TWILIO_VERIFY_SERVICE_SID",
      "TWILIO_VERIFY_SERVICE_SID has an invalid format.",
    );
  }

  const resetEnabled =
    normalizedValue(env, "ENABLE_UAT_DATABASE_RESET").toLowerCase() === "true";

  if (profile === "production" && resetEnabled) {
    addError(
      "ENABLE_UAT_DATABASE_RESET",
      "ENABLE_UAT_DATABASE_RESET must be false in production.",
    );
  }

  const expectedRuntimeRegion = normalizedValue(
    env,
    "EXPECTED_VERCEL_RUNTIME_REGION",
  );

  if (expectedRuntimeRegion && !runtimeRegionPattern.test(expectedRuntimeRegion)) {
    addError(
      "EXPECTED_VERCEL_RUNTIME_REGION",
      "EXPECTED_VERCEL_RUNTIME_REGION must be a Vercel region code such as lhr1.",
    );
  }

  const expectedVercelEnvironment = normalizedValue(env, "EXPECTED_VERCEL_ENV");

  if (
    expectedVercelEnvironment &&
    !vercelEnvironments.has(expectedVercelEnvironment.toLowerCase())
  ) {
    addError(
      "EXPECTED_VERCEL_ENV",
      "EXPECTED_VERCEL_ENV must be development, preview or production.",
    );
  }

  for (const name of ["RELEASE_GIT_SHA", "VERCEL_GIT_COMMIT_SHA"]) {
    const value = normalizedValue(env, name);

    if (value && !fullGitShaPattern.test(value)) {
      addError(name, `${name} must be a full 40-character Git commit SHA.`);
    }
  }

  if (profile === "staging") {
    const missingPrivacyVariables = privacyVariables.filter(
      (name) => !hasValue(env[name]) || isPlaceholder(normalizedValue(env, name)),
    );

    if (missingPrivacyVariables.length > 0) {
      addWarning(
        "Privacy notice",
        `Privacy notice configuration is incomplete (${missingPrivacyVariables.length} variable(s)); production verification will fail until it is approved.`,
      );
    }
  }

  const configuredCount = entries.filter(
    (entry) => entry.status === "configured",
  ).length;

  return {
    entries,
    errors,
    profile,
    summary: {
      configured: configuredCount,
      failed: errors.length,
      total: entries.length,
      warnings: warnings.length,
    },
    warnings,
  };
}

export function formatEnvironmentReport(report) {
  const lines = [`Environment inventory: ${report.profile}`];

  for (const category of categories) {
    lines.push("", category.name);

    for (const entry of report.entries.filter(
      (candidate) => candidate.category === category.name,
    )) {
      const requirement = entry.required ? "required" : entry.managed ? "managed" : "optional";
      lines.push(`  ${entry.status.toUpperCase().padEnd(15)} ${entry.name} (${requirement})`);
    }
  }

  if (report.errors.length > 0) {
    lines.push("", `Errors (${report.errors.length})`);
    lines.push(...report.errors.map((issue) => `  - ${issue.message}`));
  }

  if (report.warnings.length > 0) {
    lines.push("", `Warnings (${report.warnings.length})`);
    lines.push(...report.warnings.map((issue) => `  - ${issue.message}`));
  }

  lines.push(
    "",
    `${report.summary.configured}/${report.summary.total} variables configured; ${report.summary.failed} error(s); ${report.summary.warnings} warning(s).`,
    "No environment variable values were printed.",
  );

  return lines.join("\n");
}
