import fs from "node:fs";

const supportedCurrencies = new Set(
  JSON.parse(fs.readFileSync(new URL("../data/currencies.json", import.meta.url), "utf8")),
);

function readLocalEnv() {
  const env = {};
  const content = fs.existsSync(".env.local") ? fs.readFileSync(".env.local", "utf8") : "";

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed
      .slice(separatorIndex + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");
    env[key] = value;
  }

  return env;
}

export function loadDeploymentEnv() {
  return { ...readLocalEnv(), ...process.env };
}

function requireEnvironmentVariable(env, name) {
  const value = env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required for every deployment cell.`);
  }

  return value;
}

function assertRequiredCellEnvironment(env) {
  const requiredVariables = [
    "DEPLOYMENT_CELL_ID",
    "DEPLOYMENT_REGION",
    "APP_ROOT_DOMAIN",
    "NEXT_PUBLIC_DEFAULT_LOCALE",
    "NEXT_PUBLIC_DEFAULT_TIMEZONE",
    "NEXT_PUBLIC_DEFAULT_CURRENCY",
  ];
  const missingVariables = requiredVariables.filter((name) => !env[name]?.trim());

  if (missingVariables.length > 0) {
    throw new Error(
      `Missing required deployment cell variables: ${missingVariables.join(", ")}.`,
    );
  }
}

function normalizeRootDomain(value) {
  const domain = value.trim().toLowerCase().replace(/\.$/, "");
  const domainPattern = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

  if (!domainPattern.test(domain)) {
    throw new Error("APP_ROOT_DOMAIN must be a hostname without a protocol, path or port.");
  }

  return domain;
}

function normalizeCurrency(value) {
  const currency = value.trim().toUpperCase();

  if (!/^[A-Z]{3}$/.test(currency) || !supportedCurrencies.has(currency)) {
    throw new Error("NEXT_PUBLIC_DEFAULT_CURRENCY must be a supported currency code.");
  }

  return currency;
}

function normalizeTimezone(value, locale) {
  const timezone = value.trim();

  try {
    new Intl.DateTimeFormat(locale, { timeZone: timezone });
  } catch {
    throw new Error("NEXT_PUBLIC_DEFAULT_TIMEZONE must be a valid IANA timezone.");
  }

  return timezone;
}

function normalizeLocale(value) {
  const locale = value.trim();

  try {
    new Intl.DateTimeFormat(locale);
  } catch {
    throw new Error("NEXT_PUBLIC_DEFAULT_LOCALE must be a valid BCP 47 locale.");
  }

  return locale;
}

function normalizeCellIdentifier(value, name) {
  const identifier = value.trim();

  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(identifier)) {
    throw new Error(`${name} may contain only letters, numbers, hyphens and underscores.`);
  }

  return identifier;
}

export function resolveDeploymentConfig(env) {
  assertRequiredCellEnvironment(env);
  const locale = normalizeLocale(
    requireEnvironmentVariable(env, "NEXT_PUBLIC_DEFAULT_LOCALE"),
  );

  return {
    cellId: normalizeCellIdentifier(
      requireEnvironmentVariable(env, "DEPLOYMENT_CELL_ID"),
      "DEPLOYMENT_CELL_ID",
    ),
    currency: normalizeCurrency(
      requireEnvironmentVariable(env, "NEXT_PUBLIC_DEFAULT_CURRENCY"),
    ),
    locale,
    region: normalizeCellIdentifier(
      requireEnvironmentVariable(env, "DEPLOYMENT_REGION"),
      "DEPLOYMENT_REGION",
    ),
    rootDomain: normalizeRootDomain(
      requireEnvironmentVariable(env, "APP_ROOT_DOMAIN"),
    ),
    timezone: normalizeTimezone(
      requireEnvironmentVariable(env, "NEXT_PUBLIC_DEFAULT_TIMEZONE"),
      locale,
    ),
  };
}
