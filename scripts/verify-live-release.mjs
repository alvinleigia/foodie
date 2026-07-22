import { execFileSync } from "node:child_process";

import { loadDeploymentEnv } from "./deployment-config.mjs";
import {
  resolveReleaseExpectation,
  verifyLiveRelease,
} from "./release-verification.mjs";

function readGitHead() {
  return execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

try {
  const expectation = resolveReleaseExpectation({
    argv: process.argv.slice(2),
    env: loadDeploymentEnv(),
    gitSha: readGitHead(),
  });
  const result = await verifyLiveRelease({ expectation });

  console.log("Live release verified.");
  console.log(`URL: ${result.baseUrl}`);
  console.log(`SHA: ${result.sha}`);
  console.log(`Deployment cell: ${result.cellId}`);
  console.log(`Configured region: ${result.configuredRegion}`);
  console.log(`Runtime region: ${result.runtimeRegion}`);
  console.log(`Vercel environment: ${result.environment}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Live release verification failed.");
  process.exitCode = 1;
}
