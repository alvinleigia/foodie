import { expect, test } from "@playwright/test";

test.describe("security response headers", () => {
  test("protects browser responses without exposing the framework", async ({
    request,
  }) => {
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
