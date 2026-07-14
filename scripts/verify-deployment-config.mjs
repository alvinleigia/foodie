import {
  LEGACY_DEPLOYMENT_DEFAULTS,
  loadDeploymentEnv,
  resolveDeploymentConfig,
} from "./deployment-config.mjs";

const env = loadDeploymentEnv();
const config = resolveDeploymentConfig(env);
const usingLegacyFallbacks =
  !env.DEPLOYMENT_REGION &&
  !env.APP_ROOT_DOMAIN &&
  !env.NEXT_PUBLIC_ROOT_DOMAIN &&
  !env.NEXT_PUBLIC_DEFAULT_CURRENCY &&
  !env.NEXT_PUBLIC_DEFAULT_TIMEZONE;

console.log("Deployment configuration verified.");
console.log(`Region: ${config.region}`);
console.log(`Root domain: ${config.rootDomain}`);
console.log(`Default timezone: ${config.timezone}`);
console.log(`Default currency: ${config.currency}`);

if (usingLegacyFallbacks) {
  console.log(
    `Using backward-compatible defaults for ${LEGACY_DEPLOYMENT_DEFAULTS.rootDomain}.`,
  );
}
