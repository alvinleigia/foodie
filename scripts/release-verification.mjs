import { resolveDeploymentConfig } from "./deployment-config.mjs";

const fullGitShaPattern = /^[a-f0-9]{40}$/i;
const safeIdentifierPattern = /^[a-z0-9._-]+$/i;

const optionNames = new Map([
  ["--environment", "environment"],
  ["--runtime-region", "runtimeRegion"],
  ["--sha", "sha"],
  ["--url", "url"],
]);

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeIdentifier(value, name) {
  const normalized = value?.trim();

  if (!normalized || !safeIdentifierPattern.test(normalized)) {
    throw new Error(`${name} must contain only letters, numbers, dots, hyphens or underscores.`);
  }

  return normalized;
}

function normalizeGitSha(value) {
  const normalized = value?.trim().toLowerCase();

  if (!normalized || !fullGitShaPattern.test(normalized)) {
    throw new Error("The approved release SHA must be a full 40-character Git commit SHA.");
  }

  return normalized;
}

export function parseReleaseArguments(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const separatorIndex = argument.indexOf("=");
    const option = separatorIndex === -1 ? argument : argument.slice(0, separatorIndex);
    const property = optionNames.get(option);

    if (!property) {
      throw new Error(`Unknown release verification option: ${option}`);
    }

    const inlineValue = separatorIndex === -1 ? undefined : argument.slice(separatorIndex + 1);
    const value = inlineValue ?? argv[index + 1];

    if (!value || (!inlineValue && value.startsWith("--"))) {
      throw new Error(`${option} requires a value.`);
    }

    if (!inlineValue) {
      index += 1;
    }

    options[property] = value;
  }

  return options;
}

export function normalizeReleaseBaseUrl(value) {
  let url;

  try {
    url = new URL(value);
  } catch {
    throw new Error("The release URL must be a valid HTTPS origin.");
  }

  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "The release URL must be an HTTPS origin without credentials, a port, path, query or fragment.",
    );
  }

  return url.origin;
}

export function resolveReleaseExpectation({ argv, env, gitSha }) {
  const options = parseReleaseArguments(argv);
  const deployment = resolveDeploymentConfig(env);
  const baseUrl = normalizeReleaseBaseUrl(
    options.url ?? `https://${deployment.rootDomain}`,
  );
  const url = new URL(baseUrl);

  if (url.hostname !== deployment.rootDomain) {
    throw new Error(
      `Release URL host ${url.hostname} does not match APP_ROOT_DOMAIN ${deployment.rootDomain}.`,
    );
  }

  return {
    baseUrl,
    cellId: deployment.cellId,
    configuredRegion: deployment.region,
    environment: normalizeIdentifier(
      options.environment ?? env.EXPECTED_VERCEL_ENV ?? "production",
      "Expected Vercel environment",
    ),
    runtimeRegion: normalizeIdentifier(
      options.runtimeRegion ?? env.EXPECTED_VERCEL_RUNTIME_REGION,
      "Expected Vercel runtime region",
    ),
    sha: normalizeGitSha(options.sha ?? env.RELEASE_GIT_SHA ?? gitSha),
  };
}

function compare(errors, label, actual, expected) {
  if (actual !== expected) {
    errors.push(`${label}: expected ${expected}, received ${actual ?? "missing"}`);
  }
}

export function verifyReleaseResponse({ expectation, headers, payload, status }) {
  const errors = [];
  const deployment = isRecord(payload) && isRecord(payload.deployment)
    ? payload.deployment
    : null;

  if (status !== 200) {
    errors.push(`HTTP status: expected 200, received ${status}`);
  }

  compare(errors, "Response status", isRecord(payload) ? payload.status : undefined, "ok");
  compare(errors, "Deployment SHA", deployment?.sha, expectation.sha);
  compare(errors, "Deployment cell", deployment?.cellId, expectation.cellId);
  compare(
    errors,
    "Configured region",
    deployment?.configuredRegion,
    expectation.configuredRegion,
  );
  compare(errors, "Runtime region", deployment?.runtimeRegion, expectation.runtimeRegion);
  compare(errors, "Vercel environment", deployment?.environment, expectation.environment);
  compare(errors, "X-Deployment-Sha", headers.get("x-deployment-sha"), expectation.sha);
  compare(errors, "X-Deployment-Cell", headers.get("x-deployment-cell"), expectation.cellId);
  compare(
    errors,
    "X-Deployment-Region",
    headers.get("x-deployment-region"),
    expectation.configuredRegion,
  );

  const cacheControl = headers.get("cache-control")?.toLowerCase() ?? "";

  if (!cacheControl.includes("no-store")) {
    errors.push("Cache-Control must include no-store.");
  }

  if (errors.length > 0) {
    throw new Error(`Live release verification failed:\n- ${errors.join("\n- ")}`);
  }

  return {
    ...expectation,
    checkedAt: isRecord(payload) ? payload.timestamp : undefined,
  };
}

export async function verifyLiveRelease({ expectation, fetchImpl = fetch, timeoutMs = 15_000 }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const endpoint = new URL("/api/version", expectation.baseUrl);

  try {
    const response = await fetchImpl(endpoint, {
      headers: {
        Accept: "application/json",
        "User-Agent": "foodie-release-verifier",
      },
      redirect: "error",
      signal: controller.signal,
    });
    let payload;

    try {
      payload = await response.json();
    } catch {
      throw new Error("The live version endpoint did not return valid JSON.");
    }

    return verifyReleaseResponse({
      expectation,
      headers: response.headers,
      payload,
      status: response.status,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`The live version endpoint timed out after ${timeoutMs} ms.`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
