import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

import { organizationSettingsSchema } from "@/lib/validations/tenant-admin";

const fixtureUrl = process.env.E2E_RESTAURANT_IMAGE_FIXTURE_URL;
const defaultImage = "/images/customer-restaurant-banner.jpg";
const restaurantSettings = {
  name: "Demo Restaurant", logoUrl: "", timezone: "Europe/London", currency: "GBP",
  customerCancellationFeePercent: 0,
};

test.describe("restaurant featured image validation", () => {
  test("accepts HTTP and HTTPS images and trims the saved URL", () => {
    for (const url of ["https://images.example.com/restaurant.jpg", "http://images.example.com/restaurant.jpg"]) {
      expect(organizationSettingsSchema.parse({ ...restaurantSettings, featuredImageUrl: ` ${url} ` }).featuredImageUrl).toBe(url);
    }
  });

  test("empty, whitespace and omitted image values use the default", () => {
    for (const value of ["", "   ", undefined]) {
      expect(organizationSettingsSchema.parse({ ...restaurantSettings, featuredImageUrl: value }).featuredImageUrl).toBeNull();
    }
  });

  test("rejects malformed, non-web and oversized image URLs against the field", () => {
    for (const value of ["not a URL", "ftp://example.com/image.jpg", "javascript:alert(1)", "data:image/png;base64,abc", `https://example.com/${"a".repeat(2048)}`]) {
      const result = organizationSettingsSchema.safeParse({ ...restaurantSettings, featuredImageUrl: value });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.issues[0].path).toEqual(["featuredImageUrl"]);
    }
  });
});

for (const width of [440, 1440]) {
  test(`featured image uses custom, default and broken-image fallback at ${width}px`, async ({ page }) => {
    test.skip(!fixtureUrl, "Set E2E_RESTAURANT_IMAGE_FIXTURE_URL for isolated header checks.");
    await page.setViewportSize({ width, height: 956 });
    await page.route("https://images.example.com/restaurant.jpg", (route) => route.fulfill({
      contentType: "image/jpeg",
      body: readFileSync(path.join(process.cwd(), "public", defaultImage)),
    }));
    await page.route("https://images.example.com/broken.jpg", (route) => route.fulfill({ status: 404, body: "Not found" }));
    const image = page.locator('[data-slot="restaurant-featured-image"]');
    for (const [configured, expected] of [["", defaultImage], ["https://images.example.com/restaurant.jpg", "https://images.example.com/restaurant.jpg"], ["https://images.example.com/broken.jpg", defaultImage]]) {
      const url = new URL(fixtureUrl!);
      url.searchParams.set("featured", configured);
      await page.goto(url.toString());
      await expect(image).toBeVisible();
      await expect.poll(() => image.evaluate((element: HTMLImageElement, source) => element.complete && element.naturalWidth > 0 && (element.currentSrc.includes(encodeURIComponent(source)) || element.currentSrc.endsWith(source)), expected)).toBe(true);
      await expect(page.getByRole("heading", { name: "Demo Restaurant", exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.screenshot({ path: test.info().outputPath("featured-image-fallback.png") });
  });

  test(`settings saves, clears and validates the image URL at ${width}px`, async ({ page }) => {
    test.skip(!fixtureUrl, "Set E2E_RESTAURANT_IMAGE_FIXTURE_URL for isolated settings checks.");
    await page.setViewportSize({ width, height: 956 });
    const submissions: Array<Record<string, unknown>> = [];
    await page.route("**/api/tenant/admin/organization", (route) => {
      const body = route.request().postDataJSON();
      submissions.push(body);
      const parsed = organizationSettingsSchema.safeParse(body);
      return parsed.success
        ? route.fulfill({ json: { organization: parsed.data } })
        : route.fulfill({ status: 400, json: { error: parsed.error.flatten() } });
    });
    const url = new URL(fixtureUrl!);
    url.searchParams.set("view", "settings");
    url.searchParams.set("featured", "https://images.example.com/old.jpg");
    await page.goto(url.toString());
    const field = page.getByRole("textbox", { name: "Featured image URL", exact: true });
    await expect(field).toHaveValue("https://images.example.com/old.jpg");
    await field.fill("ftp://images.example.com/restaurant.jpg");
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(field).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("#tenant-restaurant-featured-image-error")).toHaveText("Featured image must be a valid HTTP or HTTPS URL");
    await field.fill("https://images.example.com/restaurant.jpg");
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect.poll(() => submissions.at(-1)?.featuredImageUrl).toBe("https://images.example.com/restaurant.jpg");
    await expect(page).toHaveURL(/saved=1/);
    await page.goto(url.toString());
    await field.fill("");
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect.poll(() => submissions.at(-1)?.featuredImageUrl).toBe("");
    await expect(page).toHaveURL(/saved=1/);
  });
}
