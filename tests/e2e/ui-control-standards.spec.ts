import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";

test("all application views use shared controls", () => {
  const audit = JSON.parse(execFileSync(process.execPath, ["scripts/audit-ui-controls.mjs", "--json"], { encoding: "utf8" }));
  expect(audit.pages).toBeGreaterThan(60);
  expect(audit.files).toBeGreaterThan(200);
  expect(audit.violations).toEqual([]);
  expect(audit.exceptions).toHaveLength(2);
});

const fixtureUrl = process.env.E2E_UI_CONTROLS_URL;

for (const theme of ["light", "dark", "customer"] as const) {
  for (const width of [390, 1440]) {
    test(`${theme} controls at ${width}px`, async ({ page }, testInfo) => {
      test.skip(!fixtureUrl, "Requires a temporary local UI controls fixture route.");
      await page.setViewportSize({ width, height: 1000 });
      await page.addInitScript((value) => localStorage.setItem("foodie-theme", value), theme === "light" ? "light" : "dark");
      const url = new URL(fixtureUrl!);
      if (theme === "customer") url.searchParams.set("customer", "1");
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(url.toString());
      await expect(page.getByRole("heading", { name: "Shared controls" })).toBeVisible();
      await expect(page.locator("html")).toHaveClass(theme === "light" ? /light/ : /dark/);

      for (const label of ["Name", "Native select", "Select", "Searchable select", "Currency", "Timezone", "Phone"]) {
        const control = page.getByLabel(label, { exact: true });
        await expect(control).toBeVisible();
        const box = await control.boundingBox();
        expect(box?.height, `${label} height`).toBe(40);
      }
      await page.getByLabel("Name", { exact: true }).fill("Demo customer");
      await page.getByLabel("Native select", { exact: true }).selectOption("PICKUP");
      await expect(page.getByLabel("Native select", { exact: true })).toHaveValue("PICKUP");
      await page.getByLabel("Select", { exact: true }).click();
      await page.getByRole("option", { name: "Takeaway", exact: true }).click();
      await expect(page.getByLabel("Select", { exact: true })).toHaveText("Takeaway");
      await page.getByLabel("Searchable select", { exact: true }).click();
      if (theme === "customer") await expect(page.locator('[data-slot="popover-content"][data-customer-storefront]')).toBeVisible();
      await page.getByPlaceholder("Search...", { exact: true }).fill("Drinks");
      await page.getByRole("option", { name: "Drinks", exact: true }).click();
      await expect(page.getByLabel("Searchable select", { exact: true })).toHaveText("Drinks");
      await page.getByRole("button", { name: "Delivery", exact: true }).click();
      await expect(page.getByRole("button", { name: "Delivery", exact: true })).toHaveAttribute("aria-pressed", "true");
      await page.getByRole("checkbox", { name: "Send updates" }).check();
      await expect(page.getByRole("checkbox", { name: "Send updates" })).toBeChecked();
      await page.getByRole("radio", { name: "Alternative" }).check();
      await expect(page.getByRole("radio", { name: "Standard", exact: true })).not.toBeChecked();
      await expect(page.getByLabel("Disabled field")).toBeDisabled();
      await expect(page.getByRole("button", { name: "Disabled action" })).toBeDisabled();
      const invalid = page.getByLabel("Invalid email", { exact: true });
      await expect(invalid).toHaveAttribute("aria-invalid", "true");
      await expect(invalid).toHaveAccessibleDescription("Extra email help Use a valid address Enter a valid email");
      await expect(page.getByLabel("Nested control")).toHaveAttribute("id", "nested-control");
      await expect(page.getByLabel("Nested control")).toHaveAccessibleDescription("Wrapper help");
      await invalid.fill("demo@example.com");
      await page.getByRole("button", { name: "Open dialog" }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expect(page.getByLabel("Dialog name")).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).not.toBeVisible();
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
      await page.getByLabel("Name", { exact: true }).focus();
      const focus = await page.getByLabel("Name", { exact: true }).evaluate((element) => getComputedStyle(element).boxShadow);
      expect(focus).not.toBe("none");

      // Check actual composited foreground/background colors, including hover.
      await page.getByRole("button", { name: "outline", exact: true }).hover();
      const contrasts = await page.locator('main input:not([type="radio"]):not(:disabled), main textarea, main select, main button[data-slot="button"]:not(:disabled)').evaluateAll((elements) => {
        const lum = (color: number[]) => color.map((value) => { const x = value / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
        return elements.filter((element) => element.getBoundingClientRect().width > 0).map((element) => {
          const style = getComputedStyle(element);
          // Paint the ancestor layers so translucent dark-mode surfaces are composited.
          const context = document.createElement("canvas").getContext("2d")!;
          const paint = (color: string) => { context.fillStyle = color; context.fillRect(0, 0, 1, 1); };
          const layers: string[] = [];
          for (let ancestor: Element | null = element; ancestor; ancestor = ancestor.parentElement) layers.unshift(getComputedStyle(ancestor).backgroundColor);
          paint("white");
          layers.forEach(paint);
          const backgroundLum = lum(Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3));
          paint(style.color);
          const foregroundLum = lum(Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3));
          return { text: element.textContent?.trim().slice(0, 30) || element.getAttribute("aria-label") || element.tagName, contrast: (Math.max(foregroundLum, backgroundLum) + 0.05) / (Math.min(foregroundLum, backgroundLum) + 0.05) };
        });
      });
      for (const item of contrasts) expect(item.contrast, JSON.stringify(item)).toBeGreaterThanOrEqual(4.5);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(errors).toEqual([]);
      await page.screenshot({ path: testInfo.outputPath(`${theme}-${width}.png`), fullPage: true });
    });
  }
}
