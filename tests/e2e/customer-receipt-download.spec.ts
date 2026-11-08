import fs from "node:fs";
import { expect, test } from "@playwright/test";

const fixtureUrl = process.env.E2E_RECEIPT_DOWNLOAD_FIXTURE_URL;

test.describe("customer receipt download", () => {
  test.skip(!fixtureUrl, "Set E2E_RECEIPT_DOWNLOAD_FIXTURE_URL for isolated receipt button checks.");

  test("downloads a PDF without printing, navigating or opening another tab", async ({ page }) => {
    await page.goto(fixtureUrl!);
    let requestedUrl: URL | undefined;
    await page.route("**/order/receipt/order-1/pdf?**", async (route) => {
      requestedUrl = new URL(route.request().url());
      await route.fulfill({
        body: "%PDF-1.3\nfixture",
        contentType: "application/pdf",
        headers: { "Content-Disposition": 'attachment; filename="receipt-R-000007.pdf"' },
      });
    });
    await page.evaluate(() => { window.print = () => { throw new Error("Print must not be called"); }; });
    const urlBefore = page.url();
    const downloaded = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download receipt", exact: true }).click();
    const download = await downloaded;
    expect(download.suggestedFilename()).toBe("receipt-R-000007.pdf");
    expect(fs.readFileSync((await download.path())!, "utf8")).toContain("%PDF-");
    expect(requestedUrl?.searchParams.get("qr")).toBe("snack-shack");
    expect(requestedUrl?.searchParams.get("session_id")).toBe("cs_test_fixture");
    expect(requestedUrl?.searchParams.has("print")).toBe(false);
    expect(page.url()).toBe(urlBefore);
    expect(page.context().pages()).toHaveLength(1);
  });

  test("shows an error instead of downloading an error page", async ({ page }) => {
    await page.goto(fixtureUrl!);
    await page.route("**/order/receipt/order-1/pdf?**", (route) => route.fulfill({
      status: 404, json: { error: "Receipt not found." },
    }));
    const downloads: string[] = [];
    page.on("download", (download) => downloads.push(download.suggestedFilename()));
    await page.getByRole("button", { name: "Download receipt", exact: true }).click();
    await expect(page.getByText("Receipt not found.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Download receipt", exact: true })).toBeEnabled();
    expect(downloads).toHaveLength(0);
  });

  test("redirects expired account sessions to sign-in without downloading HTML", async ({ page }) => {
    await page.goto(fixtureUrl!);
    await page.route("**/order/receipt/order-1/pdf?**", (route) => route.fulfill({
      status: 401, json: { loginHref: "/customer/login?returnTo=%2Forder%2Freceipt%2Forder-1" },
    }));
    await page.route("**/customer/login?**", (route) => route.fulfill({ body: "Sign in" }));
    await page.getByRole("button", { name: "Download receipt", exact: true }).click();
    await expect(page).toHaveURL(/\/customer\/login\?returnTo=/);
  });

  for (const width of [320, 1440]) {
    test(`customer receipt offers PDF download and never auto-prints at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript(() => {
        window.print = () => { document.documentElement.dataset.printed = "yes"; };
      });
      await page.goto(`${fixtureUrl}?view=customer&print=1`);
      await expect(page.getByRole("button", { name: "Print receipt", exact: true })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Download receipt", exact: true })).toBeVisible();
      await expect(page.getByRole("link", { name: "Back to orders", exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.route("**/order/receipt/order-1/pdf?**", async (route) => {
        const query = new URL(route.request().url()).searchParams;
        expect(query.get("qr")).toBe("snack-shack");
        expect(query.get("session_id")).toBe("cs_test_fixture");
        await route.fulfill({ body: "%PDF-1.3\nfixture", contentType: "application/pdf" });
      });
      const downloaded = page.waitForEvent("download");
      await page.getByRole("button", { name: "Download receipt", exact: true }).click();
      expect((await downloaded).suggestedFilename()).toBe("receipt.pdf");
      expect(await page.locator("html").getAttribute("data-printed")).toBeNull();
      await page.screenshot({ path: test.info().outputPath("customer-receipt.png"), fullPage: true });
    });
  }

  test("restaurant receipt retains working print controls without customer download", async ({ page }) => {
    await page.addInitScript(() => {
      window.print = () => { document.documentElement.dataset.printed = "yes"; };
    });
    await page.goto(`${fixtureUrl}?view=staff`);
    await expect(page.getByRole("button", { name: "Download receipt", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Print receipt", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-printed", "yes");
  });

  test("completed order history offers on-demand download only for issued receipts", async ({ page }) => {
    const order = {
      orderId: "order-1", orderNo: 1, organizationId: "qa", customerToken: "qa-token",
      customerName: "Demo Customer", categoryName: "Small Bites", drinkName: "Test Burger",
      fulfilmentType: "PICKUP", status: "DELIVERED", paymentStatus: "PAID",
      paymentAmount: "7.50", paymentCurrency: "GBP", itemCount: 1,
      createdAt: "2026-11-08T12:00:00.000Z", items: [], receiptNumber: 7,
    };
    await page.route("**/api/orders/status**", (route) => route.fulfill({
      json: { currency: "GBP", orders: [order, { ...order, orderId: "order-2", orderNo: 2, receiptNumber: null }] },
    }));
    await page.goto(`${fixtureUrl}?view=history`);
    await page.getByRole("tab", { name: "Completed (2)", exact: true }).click();
    await expect(page.getByRole("button", { name: "Download receipt", exact: true })).toHaveCount(1);
    await expect(page.getByRole("link", { name: "View receipt", exact: true })).toHaveAttribute(
      "href", "/order/receipt/order-1?qr=snack-shack",
    );
    await page.route("**/order/receipt/order-1/pdf?**", (route) => route.fulfill({
      body: "%PDF-1.3\nfixture", contentType: "application/pdf",
    }));
    const downloaded = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download receipt", exact: true }).click();
    expect((await downloaded).suggestedFilename()).toBe("receipt.pdf");
  });
});
