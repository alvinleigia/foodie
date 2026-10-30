import { expect, test } from "@playwright/test";

function getContrastRatio(foreground: number[], background: number[]) {
  function getLuminance(channels: number[]) {
    const [red, green, blue] = channels.map((channel) => {
      const value = channel / 255;
      return value <= 0.04045
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4;
    });

    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  }

  const foregroundLuminance = getLuminance(foreground);
  const backgroundLuminance = getLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);

  return (lighter + 0.05) / (darker + 0.05);
}

test.describe("theme preference", () => {
  test("restores the saved dark theme", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("foodie-theme", "dark"));
    await page.goto("/staff/login");

    await expect(page.locator("html")).toHaveClass(/dark/);
  });

  test("restores the saved light theme", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("foodie-theme", "light"));
    await page.goto("/staff/login");

    await expect(page.locator("html")).toHaveClass(/light/);
    await expect(page.locator("html")).not.toHaveClass(/dark/);
  });

  test("follows the system colour preference", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.addInitScript(() => localStorage.setItem("foodie-theme", "system"));
    await page.goto("/staff/login");

    await expect(page.locator("html")).toHaveClass(/dark/);
  });

  test("keeps the staff login heading readable in dark mode", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("foodie-theme", "dark"));
    await page.goto("/staff/login");

    const colors = await page.getByText("Staff Login", { exact: true }).evaluate((heading) => {
      const card = heading.closest('[data-slot="card"]');

      if (!card) {
        throw new Error("Staff login card was not found.");
      }

      function toRgb(color: string) {
        const canvas = document.createElement("canvas");
        canvas.width = 1;
        canvas.height = 1;
        const context = canvas.getContext("2d");

        if (!context) {
          throw new Error("Canvas context was not available.");
        }

        context.fillStyle = color;
        context.fillRect(0, 0, 1, 1);
        return Array.from(context.getImageData(0, 0, 1, 1).data.slice(0, 3));
      }

      return {
        background: toRgb(getComputedStyle(card).backgroundColor),
        foreground: toRgb(getComputedStyle(heading).color),
      };
    });

    expect(getContrastRatio(colors.foreground, colors.background)).toBeGreaterThanOrEqual(4.5);
  });
});
