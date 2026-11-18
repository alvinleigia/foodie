import { expect, test } from "@playwright/test";

const fixtureUrl = process.env.E2E_STAFF_REMOVAL_UI_URL;
const ownId = "10000000-0000-4000-8000-000000000001";
const targetId = "10000000-0000-4000-8000-000000000002";
const staff = [
  { membershipId: ownId, name: "Manager", role: "RESTAURANT_MANAGER" },
  { membershipId: targetId, name: "Unused staff", role: "ORDER_OPERATOR" },
].map((member) => ({ ...member, userId: member.membershipId, username: member.name, email: "staff@example.com", status: "ACTIVE", isActive: true, permissions: [], primaryJobId: null, primaryJobName: null, createdAt: "2026-11-18T10:00:00Z" }));

test.describe("staff removal controls", () => {
  test.skip(!fixtureUrl, "Set E2E_STAFF_REMOVAL_UI_URL for isolated staff panel checks.");
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/tenant/admin", (route) => route.fulfill({ json: { organization: null, orderingPoint: null, staff } }));
  });

  for (const width of [440, 1440]) {
    test(`confirms removal, supports cancellation and preserves other staff at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 956 });
      let deletes = 0;
      await page.route(`**/api/tenant/admin/staff/${targetId}`, (route) => {
        expect(route.request().method()).toBe("DELETE");
        deletes += 1;
        return route.fulfill({ json: { removedMembershipId: targetId } });
      });
      await page.goto(fixtureUrl!);
      await page.getByRole("button", { name: "Open actions for Manager", exact: true }).click();
      await expect(page.getByRole("menuitem", { name: "Remove from restaurant", exact: true })).toBeDisabled();
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Open actions for Unused staff", exact: true }).click();
      await page.getByRole("menuitem", { name: "Remove from restaurant", exact: true }).click();
      const dialog = page.getByRole("alertdialog");
      await expect(dialog).toContainText("Existing accounts and access elsewhere are kept.");
      await expect(dialog).toContainText("An unused, unaccepted invite account is also deleted");
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      expect(deletes).toBe(0);
      await page.getByRole("button", { name: "Open actions for Unused staff", exact: true }).click();
      await page.getByRole("menuitem", { name: "Remove from restaurant", exact: true }).click();
      await dialog.getByRole("button", { name: "Remove staff", exact: true }).click();
      await expect(dialog).toHaveCount(0);
      expect(deletes).toBe(1);
      await expect(page.getByText("Unused staff", { exact: true })).toHaveCount(0);
      await expect(page.getByText("Manager", { exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });

    test(`keeps linked staff and shows an actionable error at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 956 });
      await page.route(`**/api/tenant/admin/staff/${targetId}`, (route) => route.fulfill({ status: 409, json: { error: "This staff member has linked records. Deactivate their access instead of removing them." } }));
      await page.goto(fixtureUrl!);
      await page.getByRole("button", { name: "Open actions for Unused staff", exact: true }).click();
      await page.getByRole("menuitem", { name: "Remove from restaurant", exact: true }).click();
      const dialog = page.getByRole("alertdialog");
      await dialog.getByRole("button", { name: "Remove staff", exact: true }).click();
      await expect(dialog.getByRole("alert")).toContainText("Deactivate their access");
      await expect(page.getByText("Unused staff", { exact: true })).toBeVisible();
      await page.screenshot({ path: test.info().outputPath("staff-removal-blocked.png") });
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(dialog).toHaveCount(0);
    });
  }
});
