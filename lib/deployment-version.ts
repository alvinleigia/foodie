type DeploymentEnvironment = Record<string, string | undefined>;

const safeHeaderValuePattern = /^[a-z0-9._-]+$/i;

function normalizeDeploymentValue(
  value: string | undefined,
  fallback: string,
) {
  const normalized = value?.trim();

  if (!normalized || !safeHeaderValuePattern.test(normalized)) {
    return fallback;
  }

  return normalized;
}

export function resolveDeploymentIdentity(
  environment: DeploymentEnvironment = process.env,
) {
  const sha = normalizeDeploymentValue(
    environment.VERCEL_GIT_COMMIT_SHA ?? environment.GIT_COMMIT_SHA,
    "local",
  );

  return {
    cellId: normalizeDeploymentValue(
      environment.DEPLOYMENT_CELL_ID,
      "unconfigured",
    ),
    configuredRegion: normalizeDeploymentValue(
      environment.DEPLOYMENT_REGION,
      "unconfigured",
    ),
    environment: normalizeDeploymentValue(
      environment.VERCEL_ENV ?? environment.NODE_ENV,
      "local",
    ),
    runtimeRegion: normalizeDeploymentValue(
      environment.VERCEL_REGION,
      "local",
    ),
    sha,
    shortSha: sha === "local" ? sha : sha.slice(0, 12),
  };
}

export function getDeploymentResponseHeaders(
  identity = resolveDeploymentIdentity(),
) {
  return {
    "X-Deployment-Cell": identity.cellId,
    "X-Deployment-Region": identity.configuredRegion,
    "X-Deployment-Sha": identity.sha,
  };
}
