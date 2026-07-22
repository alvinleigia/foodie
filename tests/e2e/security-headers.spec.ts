import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

test.describe("security response headers", () => {
  test("configures browser protections without exposing the framework", () => {
    const source = readFileSync(
      resolve(process.cwd(), "next.config.ts"),
      "utf8",
    );

    expect(source).toContain("poweredByHeader: false");
    expect(source).toContain('"default-src \'self\'"');
    expect(source).toContain('"frame-ancestors \'none\'"');
    expect(source).toContain('"object-src \'none\'"');
    expect(source).toContain('key: "X-Frame-Options"');
    expect(source).toContain('value: "DENY"');
    expect(source).toContain('key: "X-Content-Type-Options"');
    expect(source).toContain('value: "nosniff"');
    expect(source).toContain('value: "strict-origin-when-cross-origin"');
    expect(source).toContain(
      'value: "camera=(), microphone=(), geolocation=(), browsing-topics=()"',
    );
  });

  test("protects deployed browser responses", async ({
    request,
  }) => {
    test.skip(
      !process.env.PLAYWRIGHT_BASE_URL,
      "Set PLAYWRIGHT_BASE_URL to verify response headers on a running deployment.",
    );

    const response = await request.get("/staff/login", { maxRedirects: 0 });
    const headers = response.headers();
    const contentSecurityPolicy = headers["content-security-policy"];

    expect(response.status()).toBeLessThan(400);
    expect(contentSecurityPolicy).toContain("default-src 'self'");
    expect(contentSecurityPolicy).toContain("frame-ancestors 'none'");
    expect(contentSecurityPolicy).toContain("object-src 'none'");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(headers["permissions-policy"]).toContain("camera=()");
    expect(headers["permissions-policy"]).toContain("microphone=()");
    expect(headers["permissions-policy"]).toContain("geolocation=()");
    expect(headers["x-powered-by"]).toBeUndefined();
  });
});
