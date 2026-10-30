import { encode } from "@auth/core/jwt";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import postgres from "postgres";

try {
  process.loadEnvFile(".env.local");
} catch {
  // The audit is explicitly skipped unless its environment flag is enabled.
}

type StaffRole = "PLATFORM_ADMIN" | "COMPANY_OWNER" | "RESTAURANT_MANAGER";

type StaffIdentity = {
  email: string;
  membershipId: string;
  name: string;
  organizationId: string;
  organizationSlug: string;
  role: StaffRole;
  sessionVersion: number;
  userId: string;
  username: string;
};

type AuditRoute = {
  path: string;
  role?: StaffRole;
};

type AuditFixtures = {
  identities: Record<StaffRole, StaffIdentity>;
  routes: AuditRoute[];
};

type ContrastViolation = {
  background: string;
  contrast: number;
  foreground: string;
  selector: string;
  text: string;
};

type LightSurfaceViolation = {
  background: string;
  height: number;
  selector: string;
  width: number;
};

const auditEnabled = process.env.THEME_VISIBILITY_AUDIT === "1";
const auditRouteFilter = new Set(
  (process.env.THEME_VISIBILITY_ROUTES ?? "")
    .split(",")
    .map((route) => route.trim())
    .filter(Boolean),
);
const cookieName = "authjs.session-token";
const authSecret = process.env.AUTH_SECRET;
const databaseUrl = process.env.DATABASE_URL;

async function loadAuditFixtures(): Promise<AuditFixtures> {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for the theme visibility audit.");
  }

  const sql = postgres(databaseUrl, { prepare: false });

  try {
    const identities = await sql<StaffIdentity[]>`
      select distinct on (m.role)
        u.id as "userId",
        u.name,
        u.email,
        u.username,
        u.session_version as "sessionVersion",
        m.id as "membershipId",
        m.role,
        m.organization_id as "organizationId",
        o.slug as "organizationSlug"
      from memberships m
      inner join users u on u.id = m.user_id
      inner join organizations o on o.id = m.organization_id
      where m.role in ('PLATFORM_ADMIN', 'COMPANY_OWNER', 'RESTAURANT_MANAGER')
        and m.is_active = true
        and u.status = 'ACTIVE'
        and o.is_active = true
      order by m.role, m.updated_at desc
    `;
    const identityByRole = Object.fromEntries(
      identities.map((identity) => [identity.role, identity]),
    ) as Partial<Record<StaffRole, StaffIdentity>>;

    for (const role of [
      "PLATFORM_ADMIN",
      "COMPANY_OWNER",
      "RESTAURANT_MANAGER",
    ] satisfies StaffRole[]) {
      if (!identityByRole[role]) {
        throw new Error(`No active ${role} membership is available for the audit.`);
      }
    }

    const company = identityByRole.COMPANY_OWNER!;
    const restaurant = identityByRole.RESTAURANT_MANAGER!;
    const [companyRecord] = await sql<{ id: string }[]>`
      select id from organizations where slug = ${company.organizationSlug} limit 1
    `;
    const [restaurantRecord] = await sql<{ id: string }[]>`
      select id from organizations where slug = ${restaurant.organizationSlug} limit 1
    `;
    const [companyMembership] = await sql<{ id: string }[]>`
      select id
      from memberships
      where organization_id = ${company.organizationId}
      order by updated_at desc
      limit 1
    `;
    const [restaurantMembership] = await sql<{ id: string }[]>`
      select id
      from memberships
      where organization_id = ${restaurant.organizationId}
      order by updated_at desc
      limit 1
    `;

    if (!companyRecord || !restaurantRecord || !companyMembership || !restaurantMembership) {
      throw new Error("Theme audit route fixtures could not be resolved.");
    }

    const companySlug = company.organizationSlug;
    const restaurantSlug = restaurant.organizationSlug;
    const routes: AuditRoute[] = [
      { path: "/staff/login" },
      { path: "/order" },
      { path: "/privacy" },
      { path: `/order?qr=${restaurantSlug}` },
      { path: `/customer/login?qr=${restaurantSlug}` },
      { path: "/invite" },
      { path: "/reset-password" },
      { path: "/platform", role: "PLATFORM_ADMIN" },
      { path: "/platform/companies", role: "PLATFORM_ADMIN" },
      { path: "/platform/companies/new", role: "PLATFORM_ADMIN" },
      { path: "/platform/audit-logs", role: "PLATFORM_ADMIN" },
      { path: "/platform/users/memberships", role: "PLATFORM_ADMIN" },
      { path: "/platform/users/reassign", role: "PLATFORM_ADMIN" },
      { path: `/platform/companies/${companyRecord.id}`, role: "PLATFORM_ADMIN" },
      { path: `/platform/companies/${companyRecord.id}/domains`, role: "PLATFORM_ADMIN" },
      { path: `/platform/companies/${companyRecord.id}/subscription`, role: "PLATFORM_ADMIN" },
      { path: `/platform/companies/${companyRecord.id}/users`, role: "PLATFORM_ADMIN" },
      {
        path: `/platform/companies/${companyRecord.id}/users/${companyMembership.id}`,
        role: "PLATFORM_ADMIN",
      },
      {
        path: `/platform/companies/${companyRecord.id}/staff/invite`,
        role: "PLATFORM_ADMIN",
      },
      { path: `/companies/${companySlug}`, role: "COMPANY_OWNER" },
      { path: `/companies/${companySlug}/restaurants`, role: "COMPANY_OWNER" },
      { path: `/companies/${companySlug}/restaurants/new`, role: "COMPANY_OWNER" },
      { path: `/companies/${companySlug}/users`, role: "COMPANY_OWNER" },
      { path: `/companies/${companySlug}/users/invite`, role: "COMPANY_OWNER" },
      { path: `/companies/${companySlug}/users/reassign`, role: "COMPANY_OWNER" },
      {
        path: `/companies/${companySlug}/users/${companyMembership.id}`,
        role: "COMPANY_OWNER",
      },
      { path: `/companies/${companySlug}/integrations`, role: "COMPANY_OWNER" },
      { path: `/companies/${companySlug}/audit-logs`, role: "COMPANY_OWNER" },
      {
        path: `/companies/${companySlug}/restaurants/${restaurantSlug}`,
        role: "COMPANY_OWNER",
      },
      {
        path: `/companies/${companySlug}/restaurants/${restaurantSlug}/integrations`,
        role: "COMPANY_OWNER",
      },
      {
        path: `/companies/${companySlug}/restaurants/${restaurantSlug}/staff`,
        role: "COMPANY_OWNER",
      },
      {
        path: `/companies/${companySlug}/restaurants/${restaurantSlug}/staff/invite`,
        role: "COMPANY_OWNER",
      },
      { path: `/restaurants/${restaurantSlug}`, role: "RESTAURANT_MANAGER" },
      { path: `/restaurants/${restaurantSlug}/settings`, role: "RESTAURANT_MANAGER" },
      { path: `/restaurants/${restaurantSlug}/menu`, role: "RESTAURANT_MANAGER" },
      { path: `/restaurants/${restaurantSlug}/orders`, role: "RESTAURANT_MANAGER" },
      { path: `/restaurants/${restaurantSlug}/order`, role: "RESTAURANT_MANAGER" },
      { path: `/restaurants/${restaurantSlug}/kds`, role: "RESTAURANT_MANAGER" },
      { path: `/restaurants/${restaurantSlug}/cash-drawer`, role: "RESTAURANT_MANAGER" },
      { path: `/restaurants/${restaurantSlug}/inventory`, role: "RESTAURANT_MANAGER" },
      {
        path: `/restaurants/${restaurantSlug}/preparation-stations`,
        role: "RESTAURANT_MANAGER",
      },
      { path: `/restaurants/${restaurantSlug}/reports`, role: "RESTAURANT_MANAGER" },
      { path: `/restaurants/${restaurantSlug}/integrations`, role: "RESTAURANT_MANAGER" },
      { path: `/restaurants/${restaurantSlug}/audit-logs`, role: "RESTAURANT_MANAGER" },
      { path: `/restaurants/${restaurantSlug}/staff`, role: "RESTAURANT_MANAGER" },
      { path: `/restaurants/${restaurantSlug}/staff/invite`, role: "RESTAURANT_MANAGER" },
      { path: `/restaurants/${restaurantSlug}/staff/new`, role: "RESTAURANT_MANAGER" },
      { path: `/restaurants/${restaurantSlug}/staff/reassign`, role: "RESTAURANT_MANAGER" },
      {
        path: `/restaurants/${restaurantSlug}/staff/${restaurantMembership.id}`,
        role: "RESTAURANT_MANAGER",
      },
    ];

    return {
      identities: identityByRole as Record<StaffRole, StaffIdentity>,
      routes:
        auditRouteFilter.size > 0
          ? routes.filter((route) => auditRouteFilter.has(route.path))
          : routes,
    };
  } finally {
    await sql.end();
  }
}

async function setStaffSession(context: BrowserContext, identity?: StaffIdentity) {
  await context.clearCookies();

  if (!identity) {
    return;
  }

  if (!authSecret) {
    throw new Error("AUTH_SECRET is required for authenticated theme auditing.");
  }

  const token = await encode({
    maxAge: 60 * 60,
    salt: cookieName,
    secret: authSecret,
    token: {
      email: identity.email,
      kind: "staff",
      membershipId: identity.membershipId,
      name: identity.name,
      organizationId: identity.organizationId,
      role: identity.role,
      sessionVersion: identity.sessionVersion,
      sub: identity.userId,
      username: identity.username,
    },
  });

  await context.addCookies([
    {
      domain: "localhost",
      httpOnly: true,
      name: cookieName,
      path: "/",
      sameSite: "Lax",
      secure: false,
      value: token,
    },
  ]);
}

async function scanContrastOnce(page: Page): Promise<ContrastViolation[]> {
  return page.evaluate(() => {
    type Rgba = [number, number, number, number];

    function parseColor(color: string): Rgba {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const context = canvas.getContext("2d", { willReadFrequently: true });

      if (!context) {
        return [0, 0, 0, 0];
      }

      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
      return [red, green, blue, alpha / 255];
    }

    function composite(foreground: Rgba, background: Rgba): Rgba {
      const alpha = foreground[3] + background[3] * (1 - foreground[3]);

      if (alpha === 0) {
        return [0, 0, 0, 0];
      }

      return [
        (foreground[0] * foreground[3] + background[0] * background[3] * (1 - foreground[3])) /
          alpha,
        (foreground[1] * foreground[3] + background[1] * background[3] * (1 - foreground[3])) /
          alpha,
        (foreground[2] * foreground[3] + background[2] * background[3] * (1 - foreground[3])) /
          alpha,
        alpha,
      ];
    }

    function getBackground(element: Element): Rgba | null {
      const layers: Rgba[] = [];
      let current: Element | null = element;
      let coverage = 0;

      while (current) {
        const style = getComputedStyle(current);

        if (style.backgroundImage !== "none") {
          if (coverage < 0.9) {
            return null;
          }
          break;
        }

        const color = parseColor(style.backgroundColor);
        if (color[3] > 0) {
          layers.push(color);
          coverage = color[3] + coverage * (1 - color[3]);

          if (coverage >= 0.99) {
            break;
          }
        }

        current = current.parentElement;
      }

      let background: Rgba = document.documentElement.classList.contains("dark")
        ? [28, 25, 23, 1]
        : [255, 255, 255, 1];
      for (const layer of layers.reverse()) {
        background = composite(layer, background);
      }

      return background;
    }

    function getLuminance([red, green, blue]: Rgba) {
      const channels = [red, green, blue].map((channel) => {
        const value = channel / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });

      return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
    }

    function getContrast(foreground: Rgba, background: Rgba) {
      const foregroundLuminance = getLuminance(composite(foreground, background));
      const backgroundLuminance = getLuminance(background);
      const lighter = Math.max(foregroundLuminance, backgroundLuminance);
      const darker = Math.min(foregroundLuminance, backgroundLuminance);
      return (lighter + 0.05) / (darker + 0.05);
    }

    function getSelector(element: Element) {
      const parts: string[] = [];
      let current: Element | null = element;

      while (current && parts.length < 4) {
        const id = current.id ? `#${current.id}` : "";
        const slot = current.getAttribute("data-slot");
        parts.unshift(`${current.tagName.toLowerCase()}${id}${slot ? `[data-slot="${slot}"]` : ""}`);
        current = current.parentElement;
      }

      return parts.join(" > ");
    }

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const violations: ContrastViolation[] = [];
    const seen = new Set<string>();

    while (walker.nextNode()) {
      const text = walker.currentNode.textContent?.replace(/\s+/g, " ").trim();
      const element = walker.currentNode.parentElement;

      if (!text || !element || element.closest('[aria-hidden="true"]')) {
        continue;
      }

      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        Number(style.opacity) === 0 ||
        rect.width < 2 ||
        rect.height < 2 ||
        rect.bottom < 0 ||
        rect.right < 0
      ) {
        continue;
      }

      const background = getBackground(element);
      if (!background) {
        continue;
      }

      const foreground = parseColor(style.color);
      const contrast = getContrast(foreground, background);
      const fontSize = Number.parseFloat(style.fontSize);
      const fontWeight = Number.parseInt(style.fontWeight, 10) || 400;
      const isLarge = fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700);
      const minimum = isLarge ? 3 : 4.5;

      if (contrast + 0.05 < minimum) {
        const selector = getSelector(element);
        const key = `${selector}|${text}|${foreground.join(",")}|${background.join(",")}`;
        if (!seen.has(key)) {
          seen.add(key);
          violations.push({
            background: `rgb(${background.slice(0, 3).map(Math.round).join(", ")})`,
            contrast: Number(contrast.toFixed(2)),
            foreground: `rgb(${foreground.slice(0, 3).map(Math.round).join(", ")})`,
            selector,
            text: text.slice(0, 100),
          });
        }
      }
    }

    return violations.slice(0, 30);
  });
}

async function scanContrast(page: Page): Promise<ContrastViolation[]> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await scanContrastOnce(page);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (!message.includes("Execution context was destroyed") || attempt === 2) {
        throw error;
      }

      await page.waitForTimeout(250);
    }
  }

  return [];
}

async function scanUnexpectedLightSurfaces(page: Page): Promise<LightSurfaceViolation[]> {
  return page.evaluate(() => {
    function parseColor(color: string) {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const context = canvas.getContext("2d", { willReadFrequently: true });

      if (!context) {
        return [0, 0, 0, 0];
      }

      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      return Array.from(context.getImageData(0, 0, 1, 1).data);
    }

    function isNearWhite(color: number[]) {
      return color[0] >= 235 && color[1] >= 235 && color[2] >= 235 && color[3] >= 240;
    }

    function getSelector(element: Element) {
      const parts: string[] = [];
      let current: Element | null = element;

      while (current && parts.length < 4) {
        const slot = current.getAttribute("data-slot");
        parts.unshift(`${current.tagName.toLowerCase()}${slot ? `[data-slot="${slot}"]` : ""}`);
        current = current.parentElement;
      }

      return parts.join(" > ");
    }

    const roots = [
      ...document.querySelectorAll(".theme-adaptive"),
      ...document.querySelectorAll(
        '[data-slot="dialog-content"], [data-slot="popover-content"], [data-slot="sheet-content"]',
      ),
    ];
    const candidates = new Set<Element>();

    for (const root of roots) {
      candidates.add(root);
      root.querySelectorAll("*").forEach((element) => candidates.add(element));
    }

    return Array.from(candidates)
      .filter((element) => {
        if (element.closest("[data-theme-static]")) {
          return false;
        }

        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        if (
          style.display === "none" ||
          style.visibility === "hidden" ||
          Number(style.opacity) === 0 ||
          rect.width < 180 ||
          rect.height < 80 ||
          rect.bottom < 0 ||
          rect.right < 0
        ) {
          return false;
        }

        if (!isNearWhite(parseColor(style.backgroundColor))) {
          return false;
        }

        const parent = element.parentElement;
        return !parent || !isNearWhite(parseColor(getComputedStyle(parent).backgroundColor));
      })
      .slice(0, 20)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          background: getComputedStyle(element).backgroundColor,
          height: Math.round(rect.height),
          selector: getSelector(element),
          width: Math.round(rect.width),
        };
      });
  });
}

test.describe("theme visibility audit", () => {
  test.skip(!auditEnabled, "Set THEME_VISIBILITY_AUDIT=1 to run the staging-backed audit.");
  test.describe.configure({ mode: "serial", timeout: 10 * 60_000 });

  let fixtures: AuditFixtures;

  test.beforeAll(async () => {
    fixtures = await loadAuditFixtures();
  });

  for (const theme of ["light", "dark"] as const) {
    test(`${theme} theme has readable text across application views`, async ({ context, page }) => {
      await page.addInitScript((selectedTheme) => {
        localStorage.setItem("foodie-theme", selectedTheme);
      }, theme);

      const failures: string[] = [];

      for (const route of fixtures.routes) {
        await setStaffSession(context, route.role ? fixtures.identities[route.role] : undefined);

        const response = await page.goto(route.path, {
          timeout: 60_000,
          waitUntil: "domcontentloaded",
        });
        await page.waitForTimeout(250);

        if (response && response.status() >= 500) {
          failures.push(`${route.path}: returned HTTP ${response.status()}`);
          continue;
        }

        if (route.role && new URL(page.url()).pathname === "/staff/login") {
          failures.push(`${route.path}: authenticated audit session was redirected to staff login`);
          continue;
        }

        const violations = await scanContrast(page);
        if (violations.length > 0) {
          failures.push(
            `${route.path}:\n${violations
              .map(
                (violation) =>
                  `  ${violation.contrast}:1 ${violation.foreground} on ${violation.background} - "${violation.text}" (${violation.selector})`,
              )
              .join("\n")}`,
          );
        }

        if (theme === "dark") {
          const lightSurfaces = await scanUnexpectedLightSurfaces(page);
          if (lightSurfaces.length > 0) {
            failures.push(
              `${route.path}: unexpected light surfaces in dark mode:\n${lightSurfaces
                .map(
                  (surface) =>
                    `  ${surface.width}x${surface.height} ${surface.background} (${surface.selector})`,
                )
                .join("\n")}`,
            );
          }
        }
      }

      expect(failures, failures.join("\n\n")).toEqual([]);
    });
  }

  test("representative mobile views have readable text in both themes", async ({
    context,
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    const mobileRoutes = fixtures.routes.filter(
      (route) =>
        route.path === "/staff/login" ||
        route.path === "/order" ||
        route.path === "/platform" ||
        (route.role === "COMPANY_OWNER" && route.path.endsWith("/integrations")) ||
        (route.role === "RESTAURANT_MANAGER" &&
          ["/menu", "/orders", "/integrations"].some((suffix) =>
            route.path.endsWith(suffix),
          )),
    );
    const failures: string[] = [];

    for (const theme of ["light", "dark"] as const) {
      await page.addInitScript((selectedTheme) => {
        localStorage.setItem("foodie-theme", selectedTheme);
      }, theme);

      for (const route of mobileRoutes) {
        await setStaffSession(context, route.role ? fixtures.identities[route.role] : undefined);

        const response = await page.goto(route.path, {
          timeout: 60_000,
          waitUntil: "domcontentloaded",
        });
        await page.waitForTimeout(250);

        if (response && response.status() >= 500) {
          failures.push(`${theme} ${route.path}: returned HTTP ${response.status()}`);
          continue;
        }

        const violations = await scanContrast(page);
        if (violations.length > 0) {
          failures.push(
            `${theme} ${route.path}:\n${violations
              .map(
                (violation) =>
                  `  ${violation.contrast}:1 ${violation.foreground} on ${violation.background} - "${violation.text}" (${violation.selector})`,
              )
              .join("\n")}`,
          );
        }
      }
    }

    expect(failures, failures.join("\n\n")).toEqual([]);
  });

  test("company report surfaces follow the selected theme", async ({ context, page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("foodie-theme", "dark");
    });

    const company = fixtures.identities.COMPANY_OWNER;
    await setStaffSession(context, company);
    await page.goto(`/companies/${company.organizationSlug}`, {
      waitUntil: "domcontentloaded",
    });

    const reportHeading = page.getByRole("heading", {
      name: "Financial reconciliation",
    });
    await expect(reportHeading).toBeVisible({ timeout: 20_000 });

    const reportCard = reportHeading.locator('xpath=ancestor::*[@data-slot="card"]');
    await expect(reportCard).toHaveCount(1);
    await expect
      .poll(() => reportCard.evaluate((element) => getComputedStyle(element).backgroundColor))
      .not.toBe("rgb(255, 255, 255)");
  });

  test("staff account menu exposes the theme preference", async ({ context, page }) => {
    const company = fixtures.identities.COMPANY_OWNER;
    await setStaffSession(context, company);
    await page.goto(`/companies/${company.organizationSlug}`, {
      waitUntil: "domcontentloaded",
    });

    await page.locator('header button[aria-haspopup="menu"]').click();
    await expect(page.getByRole("group", { name: "Theme preference" })).toBeVisible();

    await page.getByRole("button", { name: "Light", exact: true }).click();
    await expect(page.locator("html")).toHaveClass(/light/);
    await expect(page.locator("html")).not.toHaveClass(/dark/);
  });

  test("application header remains dark in both themes", async ({ context, page }) => {
    const company = fixtures.identities.COMPANY_OWNER;
    await setStaffSession(context, company);

    for (const theme of ["light", "dark"] as const) {
      await page.addInitScript((selectedTheme) => {
        localStorage.setItem("foodie-theme", selectedTheme);
      }, theme);
      await page.goto(`/companies/${company.organizationSlug}`, {
        timeout: 60_000,
        waitUntil: "domcontentloaded",
      });

      const headerColor = await page.locator("header").evaluate((header) => {
        const canvas = document.createElement("canvas");
        canvas.width = 1;
        canvas.height = 1;
        const context = canvas.getContext("2d", { willReadFrequently: true });

        if (!context) {
          throw new Error("Canvas context was not available.");
        }

        context.fillStyle = getComputedStyle(header).backgroundColor;
        context.fillRect(0, 0, 1, 1);
        return Array.from(context.getImageData(0, 0, 1, 1).data.slice(0, 3));
      });

      expect(Math.max(...headerColor)).toBeLessThan(50);
    }
  });

  test("legacy hover surfaces remain dark-theme aware", async ({ context, page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("foodie-theme", "dark");
    });

    const company = fixtures.identities.COMPANY_OWNER;
    const restaurant = fixtures.identities.RESTAURANT_MANAGER;
    const routes: AuditRoute[] = [
      { path: `/companies/${company.organizationSlug}`, role: "COMPANY_OWNER" },
      { path: `/restaurants/${restaurant.organizationSlug}/orders`, role: "RESTAURANT_MANAGER" },
      { path: `/restaurants/${restaurant.organizationSlug}/order`, role: "RESTAURANT_MANAGER" },
      { path: `/restaurants/${restaurant.organizationSlug}/menu`, role: "RESTAURANT_MANAGER" },
      { path: `/restaurants/${restaurant.organizationSlug}/inventory`, role: "RESTAURANT_MANAGER" },
    ];
    const failures: string[] = [];
    const legacyHoverSelector = [
      '[class*="hover:bg-white"]',
      '[class*="hover:bg-stone-50"]',
      '[class*="hover:bg-stone-100"]',
      '[class*="hover:bg-stone-200"]',
    ].join(", ");

    for (const route of routes) {
      await setStaffSession(context, fixtures.identities[route.role!]);
      await page.goto(route.path, { timeout: 60_000, waitUntil: "domcontentloaded" });
      await page.waitForTimeout(300);

      const targets = page.locator(`.theme-adaptive :is(${legacyHoverSelector})`);
      const targetCount = Math.min(await targets.count(), 80);

      for (let index = 0; index < targetCount; index += 1) {
        const target = targets.nth(index);
        if (!(await target.isVisible())) {
          continue;
        }

        await target.hover();
        const result = await target.evaluate((element) => {
          const canvas = document.createElement("canvas");
          canvas.width = 1;
          canvas.height = 1;
          const context = canvas.getContext("2d", { willReadFrequently: true });
          const rect = element.getBoundingClientRect();

          if (!context) {
            return null;
          }

          context.fillStyle = getComputedStyle(element).backgroundColor;
          context.fillRect(0, 0, 1, 1);
          const color = Array.from(context.getImageData(0, 0, 1, 1).data);
          return {
            color,
            height: Math.round(rect.height),
            width: Math.round(rect.width),
          };
        });

        if (
          result &&
          result.color[0] >= 235 &&
          result.color[1] >= 235 &&
          result.color[2] >= 235 &&
          result.color[3] >= 240
        ) {
          failures.push(
            `${route.path}: hover target ${result.width}x${result.height} became ${result.color.join(",")}`,
          );
        }
      }
    }

    expect(failures, failures.join("\n")).toEqual([]);
  });

  test("order summaries have padded surfaces and aligned controls", async ({
    context,
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem("foodie-theme", "dark");
    });

    const restaurant = fixtures.identities.RESTAURANT_MANAGER;
    await setStaffSession(context, restaurant);
    await page.goto(`/restaurants/${restaurant.organizationSlug}/orders`, {
      timeout: 60_000,
      waitUntil: "domcontentloaded",
    });

    const summary = page.locator('[data-slot="order-summary"]').first();
    await expect(summary).toBeVisible({ timeout: 20_000 });

    const summaryStyle = await summary.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        paddingLeft: Number.parseFloat(style.paddingLeft),
        paddingTop: Number.parseFloat(style.paddingTop),
      };
    });
    expect(summaryStyle.paddingLeft).toBeGreaterThanOrEqual(16);
    expect(summaryStyle.paddingTop).toBeGreaterThanOrEqual(16);

    const detailsToggle = page.locator('[data-slot="order-details-toggle"]').first();
    const primaryAction = page.locator('[data-slot="order-primary-action"]').first();
    await expect(detailsToggle).toBeVisible();
    await expect(primaryAction).toBeVisible();

    const detailsBox = await detailsToggle.boundingBox();
    const actionBox = await primaryAction.boundingBox();
    expect(detailsBox).not.toBeNull();
    expect(actionBox).not.toBeNull();
    expect(Math.abs(detailsBox!.y - actionBox!.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(detailsBox!.height - actionBox!.height)).toBeLessThanOrEqual(1);

    await summary.hover();
    const hoverBackground = await summary.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    );
    expect(hoverBackground).not.toBe("rgb(255, 255, 255)");
  });

  test("order review uses compact controls and responsive columns", async ({
    context,
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem("foodie-theme", "dark");
    });
    await page.setViewportSize({ height: 900, width: 1280 });

    const restaurant = fixtures.identities.RESTAURANT_MANAGER;
    await setStaffSession(context, restaurant);
    await page.goto(`/restaurants/${restaurant.organizationSlug}/order`, {
      timeout: 60_000,
      waitUntil: "domcontentloaded",
    });

    const addButton = page.getByRole("button", { exact: true, name: "Add" }).first();
    const customizeButton = page
      .getByRole("button", { exact: true, name: "Customize" })
      .first();
    await page.locator('[data-slot="menu-item-action"] button').first().waitFor();
    const usesAddButton = await addButton.isVisible();
    const menuAction = (usesAddButton ? addButton : customizeButton).locator(
      'xpath=ancestor::*[@data-slot="menu-item-action"]',
    );
    const menuRow = menuAction.locator('xpath=ancestor::*[@data-slot="menu-item-row"]');
    const menuDetails = menuRow.locator('[data-slot="menu-item-details"]');
    const menuActionBox = await menuAction.boundingBox();
    const menuDetailsBox = await menuDetails.boundingBox();

    expect(menuActionBox).not.toBeNull();
    expect(menuDetailsBox).not.toBeNull();
    expect(menuActionBox!.x).toBeGreaterThanOrEqual(
      menuDetailsBox!.x + menuDetailsBox!.width,
    );

    if (usesAddButton) {
      await addButton.click();
    } else {
      await customizeButton.click();
      await page.getByRole("button", { exact: true, name: "Add to Cart" }).click();
    }

    await expect(
      page.getByRole("button", { name: /Increase .+ quantity/ }).first(),
    ).toBeVisible();

    await page.getByRole("button", { exact: true, name: "View Cart" }).click();
    await page.getByRole("button", { exact: true, name: "Review Order" }).click();
    await expect(page.getByText("Your cart", { exact: true })).toBeHidden();
    await page.getByText("Order summary", { exact: true }).waitFor();

    const fields = page.locator('[data-slot="order-review-fields"]');
    const summary = page.locator('[data-slot="order-review-summary"]');
    const customerSearch = page.locator('[data-slot="staff-customer-search"]');
    const selectedOrderType = page.getByRole("radio", { checked: true }).locator("..");
    const readyTime = page.getByRole("button", { exact: true, name: "ASAP" });
    const fieldsBox = await fields.boundingBox();
    const summaryBox = await summary.boundingBox();
    const customerSearchBox = await customerSearch.boundingBox();
    const orderTypeBox = await selectedOrderType.boundingBox();
    const readyTimeBox = await readyTime.boundingBox();

    expect(fieldsBox).not.toBeNull();
    expect(summaryBox).not.toBeNull();
    expect(customerSearchBox).not.toBeNull();
    expect(orderTypeBox).not.toBeNull();
    expect(readyTimeBox).not.toBeNull();
    expect(summaryBox!.x).toBeGreaterThan(fieldsBox!.x);
    expect(summaryBox!.x - (customerSearchBox!.x + customerSearchBox!.width)).toBeGreaterThanOrEqual(
      24,
    );
    expect(orderTypeBox!.height).toBeLessThanOrEqual(64);
    expect(readyTimeBox!.height).toBeLessThanOrEqual(52);
    expect(await scanContrast(page)).toEqual([]);

    await page.evaluate(() => {
      document.documentElement.classList.remove("dark");
      document.documentElement.style.colorScheme = "light";
    });
    expect(await scanContrast(page)).toEqual([]);

    await page.setViewportSize({ height: 844, width: 390 });
    const mobileFieldsBox = await fields.boundingBox();
    const mobileSummaryBox = await summary.boundingBox();
    expect(mobileFieldsBox).not.toBeNull();
    expect(mobileSummaryBox).not.toBeNull();
    expect(mobileSummaryBox!.y).toBeGreaterThan(
      mobileFieldsBox!.y + mobileFieldsBox!.height,
    );
  });

  test("customized menu items expose separate variants", async ({ context, page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("foodie-theme", "dark");
    });
    await page.setViewportSize({ height: 900, width: 1280 });

    const restaurant = fixtures.identities.RESTAURANT_MANAGER;
    await setStaffSession(context, restaurant);
    await page.goto(`/restaurants/${restaurant.organizationSlug}/order`, {
      timeout: 60_000,
      waitUntil: "domcontentloaded",
    });

    const customizeButton = page
      .getByRole("button", { exact: true, name: "Customize" })
      .first();
    await customizeButton.waitFor();
    const customizationRow = customizeButton.locator(
      'xpath=ancestor::*[@data-slot="menu-item-row"]',
    );
    const productName = (await customizationRow.locator("p").first().textContent())?.trim();
    if (!productName) {
      throw new Error("The customizable product name could not be resolved.");
    }
    const productRow = page
      .locator('[data-slot="menu-item-row"]')
      .filter({ hasText: productName })
      .first();

    await customizeButton.click();
    await page.getByRole("button", { exact: true, name: "Add to Cart" }).click();
    await expect(productRow.locator('[data-slot="menu-item-customization-summary"]')).toHaveText(
      "No add-ons selected",
    );

    await productRow
      .getByRole("button", { name: `Increase ${productName} quantity` })
      .click();
    await page.getByRole("button", { exact: true, name: "Customize separately" }).click();
    const availableOption = page.locator('[role="checkbox"]:not([disabled])').first();
    await availableOption.click();
    await page.getByRole("button", { exact: true, name: "Add to Cart" }).click();

    await expect(productRow.locator('[data-slot="menu-item-variant-count"]')).toHaveText(
      "2 added · 2 variants",
    );
    await productRow.getByRole("button", { exact: true, name: "Add another" }).click();
    await expect(page.getByRole("heading", { name: "Customize item" })).toBeVisible();
    await page.getByRole("button", { exact: true, name: "Cancel" }).click();
    await productRow.getByRole("button", { exact: true, name: "Manage variants" }).click();
    await expect(page.getByRole("heading", { name: `Manage ${productName}` })).toBeVisible();
    await expect(page.getByText("Variant 1", { exact: true })).toBeVisible();
    await expect(page.getByText("Variant 2", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { exact: true, name: "Edit" })).toHaveCount(2);
    expect(await scanContrast(page)).toEqual([]);

    await page.getByRole("button", { exact: true, name: "Full cart" }).click();
    await expect(page.getByRole("heading", { name: "Your cart" })).toBeVisible();
  });

  test("client-fetched sections render structural skeletons", async ({ context, page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("foodie-theme", "dark");
    });

    const restaurant = fixtures.identities.RESTAURANT_MANAGER;
    const company = fixtures.identities.COMPANY_OWNER;
    const cases: Array<{
      apiPattern: string;
      label: string;
      path: string;
      role: StaffRole;
    }> = [
      {
        apiPattern: "**/api/company/summary**",
        label: "Loading company dashboard",
        path: `/companies/${company.organizationSlug}`,
        role: "COMPANY_OWNER",
      },
      {
        apiPattern: "**/api/menu/admin**",
        label: "Loading menu manager",
        path: `/restaurants/${restaurant.organizationSlug}/menu`,
        role: "RESTAURANT_MANAGER",
      },
      {
        apiPattern: "**/api/inventory**",
        label: "Loading inventory",
        path: `/restaurants/${restaurant.organizationSlug}/inventory`,
        role: "RESTAURANT_MANAGER",
      },
      {
        apiPattern: "**/api/orders/kds**",
        label: "Loading preparation tickets",
        path: `/restaurants/${restaurant.organizationSlug}/kds`,
        role: "RESTAURANT_MANAGER",
      },
    ];

    for (const skeletonCase of cases) {
      await setStaffSession(context, fixtures.identities[skeletonCase.role]);
      await page.route(skeletonCase.apiPattern, async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 1_200));
        await route.continue();
      });

      await page.goto(skeletonCase.path, { waitUntil: "domcontentloaded" });

      const loadingLabel = page.getByText(skeletonCase.label, { exact: true });
      await expect(loadingLabel).toBeAttached();
      await expect(page.locator('[data-slot="skeleton"]')).not.toHaveCount(0);
      await expect(loadingLabel).not.toBeAttached({ timeout: 20_000 });

      await page.unroute(skeletonCase.apiPattern);
    }
  });
});
