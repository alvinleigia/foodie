import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

import { isCurrentStaffSessionVersion } from "@/lib/staff-session";

test.describe("staff session revocation", () => {
  test("rejects stale and malformed session versions", () => {
    expect(isCurrentStaffSessionVersion(4, 4)).toBe(true);
    expect(isCurrentStaffSessionVersion(3, 4)).toBe(false);
    expect(isCurrentStaffSessionVersion(undefined, 4)).toBe(false);
    expect(isCurrentStaffSessionVersion("4", 4)).toBe(false);
  });

  test("requires live staff access before accepting a JWT", () => {
    const authSource = readFileSync(resolve(process.cwd(), "auth.ts"), "utf8");
    const validationSource = readFileSync(
      resolve(process.cwd(), "lib", "staff-session.ts"),
      "utf8",
    );

    expect(authSource).toContain("validateStaffSessionAccess({");
    expect(authSource).toMatch(/if \(!access\) \{\s+return null;/);
    expect(validationSource).toContain("eq(memberships.isActive, true)");
    expect(validationSource).toContain('eq(users.status, "ACTIVE")');
    expect(validationSource).toContain("eq(organizations.isActive, true)");
  });

  test("password writes revoke existing staff sessions", () => {
    const passwordResetSource = readFileSync(
      resolve(process.cwd(), "lib", "password-reset.ts"),
      "utf8",
    );
    const invitationSource = readFileSync(
      resolve(process.cwd(), "lib", "invitations.ts"),
      "utf8",
    );

    expect(passwordResetSource).toContain(
      "sessionVersion: sql`${users.sessionVersion} + 1`",
    );
    expect(invitationSource).toContain(
      "sessionVersion: sql`${users.sessionVersion} + 1`",
    );
  });
});
