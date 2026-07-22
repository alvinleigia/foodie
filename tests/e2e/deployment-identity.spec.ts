import fs from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import {
  getDeploymentResponseHeaders,
  resolveDeploymentIdentity,
} from "@/lib/deployment-version";

const root = process.cwd();

test.describe("deployment identity", () => {
  test("exposes normalized release and runtime identity", () => {
    const identity = resolveDeploymentIdentity({
      DEPLOYMENT_CELL_ID: "uk-prod-1",
      DEPLOYMENT_REGION: "UK",
      VERCEL_ENV: "production",
      VERCEL_GIT_COMMIT_SHA: "0123456789abcdef0123456789abcdef01234567",
      VERCEL_REGION: "lhr1",
    });

    expect(identity).toEqual({
      cellId: "uk-prod-1",
      configuredRegion: "UK",
      environment: "production",
      runtimeRegion: "lhr1",
      sha: "0123456789abcdef0123456789abcdef01234567",
      shortSha: "0123456789ab",
    });
    expect(getDeploymentResponseHeaders(identity)).toEqual({
      "X-Deployment-Cell": "uk-prod-1",
      "X-Deployment-Region": "UK",
      "X-Deployment-Sha": "0123456789abcdef0123456789abcdef01234567",
    });
  });

  test("rejects unsafe environment values from response headers", () => {
    expect(
      resolveDeploymentIdentity({
        DEPLOYMENT_CELL_ID: "bad\r\nheader",
        DEPLOYMENT_REGION: "UK west",
        VERCEL_GIT_COMMIT_SHA: "not/a/sha",
      }),
    ).toMatchObject({
      cellId: "unconfigured",
      configuredRegion: "unconfigured",
      sha: "local",
    });
  });

  test("publishes the release identity on responses and the version endpoint", () => {
    const configSource = fs.readFileSync(path.join(root, "next.config.ts"), "utf8");
    const routeSource = fs.readFileSync(
      path.join(root, "app/api/version/route.ts"),
      "utf8",
    );

    expect(configSource).toContain("getDeploymentResponseHeaders");
    expect(routeSource).toContain('"Cache-Control": "no-store"');
    expect(routeSource).toContain("resolveDeploymentIdentity");
  });
});
