import {
  loadDeploymentEnv,
  resolveDeploymentConfig,
} from "./deployment-config.mjs";

const env = loadDeploymentEnv();
const config = resolveDeploymentConfig(env);

console.log("Deployment configuration verified.");
console.log(`Cell: ${config.cellId}`);
console.log(`Region: ${config.region}`);
console.log(`Root domain: ${config.rootDomain}`);
console.log(`Default locale: ${config.locale}`);
console.log(`Default timezone: ${config.timezone}`);
console.log(`Default currency: ${config.currency}`);
