import fs from "node:fs";

const supportedCurrencies = new Set(
  JSON.parse(fs.readFileSync(new URL("../data/currencies.json", import.meta.url), "utf8")),
);

export const LEGACY_DEPLOYMENT_DEFAULTS = {
  currency: "INR",
  region: "legacy",
  rootDomain: "foodie.leigia.com",
  timezone: "Asia/Calcutta",
};

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

function normalizeTimezone(value) {
  const timezone = value.trim();

  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone });
  } catch {
    throw new Error("NEXT_PUBLIC_DEFAULT_TIMEZONE must be a valid IANA timezone.");
  }

  return timezone;
}

export function resolveDeploymentConfig(env) {
  const configuredAppRootDomain = env.APP_ROOT_DOMAIN?.trim();
  const configuredPublicRootDomain = env.NEXT_PUBLIC_ROOT_DOMAIN?.trim();

  if (
    configuredAppRootDomain &&
    configuredPublicRootDomain &&
    normalizeRootDomain(configuredAppRootDomain) !==
      normalizeRootDomain(configuredPublicRootDomain)
  ) {
    throw new Error("APP_ROOT_DOMAIN and NEXT_PUBLIC_ROOT_DOMAIN must match.");
  }

  const region = env.DEPLOYMENT_REGION?.trim() || LEGACY_DEPLOYMENT_DEFAULTS.region;

  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(region)) {
    throw new Error("DEPLOYMENT_REGION may contain only letters, numbers, hyphens and underscores.");
  }

  return {
    currency: normalizeCurrency(
      env.NEXT_PUBLIC_DEFAULT_CURRENCY || LEGACY_DEPLOYMENT_DEFAULTS.currency,
    ),
    region,
    rootDomain: normalizeRootDomain(
      configuredAppRootDomain ||
        configuredPublicRootDomain ||
        LEGACY_DEPLOYMENT_DEFAULTS.rootDomain,
    ),
    timezone: normalizeTimezone(
      env.NEXT_PUBLIC_DEFAULT_TIMEZONE || LEGACY_DEPLOYMENT_DEFAULTS.timezone,
    ),
  };
}
