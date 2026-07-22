import assert from "node:assert/strict";
import test from "node:test";

import {
  parseReleaseArguments,
  resolveReleaseExpectation,
  verifyReleaseResponse,
} from "../scripts/release-verification.mjs";

const sha = "0123456789abcdef0123456789abcdef01234567";
const deploymentEnvironment = {
  APP_ROOT_DOMAIN: "foodie-staging.example.com",
  DEPLOYMENT_CELL_ID: "uk-uat-1",
  DEPLOYMENT_REGION: "UK-UAT",
  NEXT_PUBLIC_DEFAULT_CURRENCY: "GBP",
  NEXT_PUBLIC_DEFAULT_LOCALE: "en-GB",
  NEXT_PUBLIC_DEFAULT_TIMEZONE: "Europe/London",
};

test("resolves the approved release from deployment metadata and Git HEAD", () => {
  assert.deepEqual(
    resolveReleaseExpectation({
      argv: ["--runtime-region=hnd1"],
      env: deploymentEnvironment,
      gitSha: sha,
    }),
    {
      baseUrl: "https://foodie-staging.example.com",
      cellId: "uk-uat-1",
      configuredRegion: "UK-UAT",
      environment: "production",
      runtimeRegion: "hnd1",
      sha,
    },
  );
});

test("supports explicit release overrides for CI", () => {
  assert.deepEqual(
    parseReleaseArguments([
      "--url",
      "https://foodie-staging.example.com",
      "--sha",
      sha,
      "--runtime-region",
      "hnd1",
      "--environment",
      "preview",
    ]),
    {
      environment: "preview",
      runtimeRegion: "hnd1",
      sha,
      url: "https://foodie-staging.example.com",
    },
  );
});

test("accepts matching live identity, headers and cache controls", () => {
  const expectation = resolveReleaseExpectation({
    argv: ["--runtime-region", "hnd1"],
    env: deploymentEnvironment,
    gitSha: sha,
  });
  const result = verifyReleaseResponse({
    expectation,
    headers: new Headers({
      "cache-control": "private, no-store",
      "x-deployment-cell": "uk-uat-1",
      "x-deployment-region": "UK-UAT",
      "x-deployment-sha": sha,
    }),
    payload: {
      deployment: {
        cellId: "uk-uat-1",
        configuredRegion: "UK-UAT",
        environment: "production",
        runtimeRegion: "hnd1",
        sha,
      },
      status: "ok",
      timestamp: "2026-07-22T15:00:00.000Z",
    },
    status: 200,
  });

  assert.deepEqual(result, {
    ...expectation,
    checkedAt: "2026-07-22T15:00:00.000Z",
  });
});

test("fails closed when the deployed release does not match", () => {
  const expectation = resolveReleaseExpectation({
    argv: ["--runtime-region", "hnd1"],
    env: deploymentEnvironment,
    gitSha: sha,
  });

  assert.throws(
    () =>
      verifyReleaseResponse({
        expectation,
        headers: new Headers(),
        payload: {
          deployment: {
            cellId: "wrong-cell",
            configuredRegion: "UK-UAT",
            environment: "production",
            runtimeRegion: "iad1",
            sha: "f".repeat(40),
          },
          status: "ok",
        },
        status: 200,
      }),
    /Deployment SHA.*Deployment cell.*Runtime region.*Cache-Control/s,
  );
});

test("requires an expected runtime region and the exact platform origin", () => {
  assert.throws(
    () =>
      resolveReleaseExpectation({
        argv: [],
        env: deploymentEnvironment,
        gitSha: sha,
      }),
    /Expected Vercel runtime region/,
  );

  assert.throws(
    () =>
      resolveReleaseExpectation({
        argv: [
          "--runtime-region",
          "hnd1",
          "--url",
          "https://another.example.com",
        ],
        env: deploymentEnvironment,
        gitSha: sha,
      }),
    /does not match APP_ROOT_DOMAIN/,
  );

  assert.throws(
    () =>
      resolveReleaseExpectation({
        argv: [
          "--runtime-region",
          "hnd1",
          "--url",
          "https://foodie-staging.example.com:8443",
        ],
        env: deploymentEnvironment,
        gitSha: sha,
      }),
    /without credentials, a port/,
  );
});
