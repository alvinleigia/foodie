import { loadDeploymentEnv } from "./deployment-config.mjs";
import {
  formatEnvironmentReport,
  inspectEnvironment,
  parseEnvironmentArguments,
} from "./environment-inventory.mjs";

try {
  const { profile } = parseEnvironmentArguments(process.argv.slice(2));
  const report = inspectEnvironment({ env: loadDeploymentEnv(), profile });

  console.log(formatEnvironmentReport(report));

  if (report.errors.length > 0) {
    process.exitCode = 1;
  }
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Environment verification failed.",
  );
  process.exitCode = 1;
}
