import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

test("Stripe Connect provisioning uses Accounts v2 managed-risk onboarding", () => {
  const source = readFileSync("lib/organization-payment-settings.ts", "utf8");

  expect(source).toContain("stripe.v2.core.accounts.create");
  expect(source).toContain('dashboard: "full"');
  expect(source).toContain('fees_collector: "stripe"');
  expect(source).toContain('losses_collector: "stripe"');
  expect(source).toContain("stripe.v2.core.accountLinks.create");
  expect(source).toContain('type: "account_onboarding"');
  expect(source).toContain('configurations: ["merchant"]');
  expect(source).not.toContain('type: "express"');
});
