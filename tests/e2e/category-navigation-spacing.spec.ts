import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { devices, expect, test } from "@playwright/test";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function customerNavigationClass() {
  const filename = "components/order/OrderForm.tsx";
  const source = ts.createSourceFile(filename, readFileSync(filename, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let className = "";
  function visit(node: ts.Node) {
    if (ts.isStringLiteral(node) && node.text.startsWith("customer-category-navigation ")) {
      className = node.text;
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (!className) throw new Error("Customer category navigation classes were not found.");
  return className;
}

function applicationCss() {
  const directory = ".next/static/chunks";
  const files = readdirSync(directory).filter((name) => name.endsWith(".css"));
  if (!files.length) throw new Error("Run npm run build before the category spacing checks.");
  return files.map((name) => readFileSync(join(directory, name), "utf8")).join("\n");
}

for (const device of ["Desktop Chrome", "Pixel 7", "iPhone 13"] as const) {
  for (const scrollbar of ["native", "hidden overlay"] as const) {
    test(`balances category spacing on ${device} with ${scrollbar} scrollbars`, async ({ browser }, testInfo) => {
      const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices[device];
      const context = await browser.newContext({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch });
      const page = await context.newPage();
      try {
        // Render the actual navigation classes and shared button styles with built app CSS.
        // No restaurant/database fixture is needed for this layout regression.
        const navigation = renderToStaticMarkup(createElement("main", { "data-customer-storefront": "" },
          createElement("div", { style: { height: 120 } }),
          createElement("div", { "data-slot": "category-navigation-container", className: "sticky top-0 border-b bg-white px-4" },
            createElement("nav", { className: customerNavigationClass(), "aria-label": "Menu categories" },
              createElement("div", { className: "flex min-w-max gap-2" },
                ["Small Bites", "Goan Breakfast", "Goan Street Food", "Drinks (Cold)", "Desserts"].map((category, index) =>
                  createElement("button", { key: category, type: "button", className: cn(buttonVariants({ size: "xl", variant: index ? "outline" : "default" })), "data-slot": "button", "data-size": "xl", "data-variant": index ? "outline" : "default", "aria-pressed": index === 0 }, category),
                ),
              ),
            ),
          ),
          createElement("div", { style: { height: 2000 } }),
        ));
        await page.setContent(`<!doctype html><html class="light" style="--font-geist-sans: Arial, sans-serif"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>${navigation}</body></html>`);
        await page.addStyleTag({ content: applicationCss() });
        if (scrollbar === "hidden overlay") {
          await page.addStyleTag({ content: ".customer-category-navigation { scrollbar-width: none; } .customer-category-navigation::-webkit-scrollbar { display: none; }" });
        }
        if (device !== "Desktop Chrome") {
          expect(await page.evaluate(() => navigator.maxTouchPoints)).toBeGreaterThan(0);
          expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
        }
        const bar = page.getByRole("navigation", { name: "Menu categories" });
        await expect(bar.getByRole("button").first()).toHaveCSS("height", "44px");
        const container = page.locator('[data-slot="category-navigation-container"]');
        async function expectBalancedSpacing() {
          const spacing = await bar.evaluate((element) => {
            const button = element.querySelector("button")!.getBoundingClientRect();
            const bounds = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            return { top: button.top - bounds.top, bottom: bounds.top + element.clientHeight - button.bottom, paddingTop: style.paddingTop, paddingBottom: style.paddingBottom };
          });
          expect(spacing.paddingTop).toBe("12px");
          expect(spacing.paddingBottom).toBe("12px");
          expect(Math.abs(spacing.top - spacing.bottom)).toBeLessThanOrEqual(1);
        }
        await expectBalancedSpacing();
        await page.evaluate(() => scrollTo({ top: 250, behavior: "instant" }));
        await expect.poll(async () => Math.round((await container.boundingBox())!.y)).toBe(0);
        await bar.evaluate((element) => { element.scrollLeft = element.scrollWidth; });
        await expectBalancedSpacing();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await container.screenshot({ path: testInfo.outputPath("sticky-category-spacing.png"), animations: "disabled" });
      } finally {
        await context.close();
      }
    });
  }
}
