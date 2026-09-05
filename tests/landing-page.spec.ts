import { test, expect } from "@playwright/test";
import { test as authedTest } from "./fixtures";

/**
 * Priority 7: the public pre-login landing page, at `/welcome`. These tests
 * run as genuine anonymous visitors (no dev-bypass, no session) — the point
 * of this page is that it never requires auth — except the authed-redirect
 * tests, which confirm the bare "/" redirector sends each kind of visitor to
 * the right place instead of ever rendering content of its own.
 */

test("landing page loads unauthenticated with C4 OS branding, not C4 InsightOS", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("/welcome", { waitUntil: "load" });

  await expect(page).toHaveTitle(/C4 OS/);
  await expect(page.getByText("C4 OS", { exact: true }).first()).toBeVisible();
  // The public identity is "C4 OS" — never the internal "C4 InsightOS" name.
  await expect(page.getByText("C4 InsightOS", { exact: false })).toHaveCount(0);
  await expect(page.getByText("InsightOS", { exact: false })).toHaveCount(0);

  expect(errors).toEqual([]);
});

test("primary CTA and header sign-in route to the login screen", async ({ page }) => {
  await page.goto("/welcome", { waitUntil: "load" });
  await page.getByRole("link", { name: "Access C4 OS" }).first().click();
  await expect(page).toHaveURL(/\/login$/);
});

test("secondary CTA scrolls to the how-it-works section", async ({ page }) => {
  await page.goto("/welcome", { waitUntil: "load" });
  await page.getByRole("link", { name: "See how it works" }).click();
  await expect(page.getByText("Built to operate, not just to report.")).toBeVisible();
});

test("header nav anchors scroll to their sections", async ({ page }) => {
  await page.goto("/welcome", { waitUntil: "load" });
  const header = page.getByRole("banner");
  await header.getByRole("link", { name: "Platform", exact: true }).click();
  await expect(
    page.getByText("Every part of the operation, in one system.", { exact: true }),
  ).toBeInViewport();

  await header.getByRole("link", { name: "FAQ", exact: true }).click();
  await expect(page.getByText("Common questions", { exact: true })).toBeInViewport();
});

test("FAQ accordion opens and closes", async ({ page }) => {
  await page.goto("/welcome", { waitUntil: "load" });
  const question = page.getByRole("button", { name: "What is C4 OS?" });
  const answer = page.getByText("C4 OS is an operating system for the business itself", {
    exact: false,
  });
  await question.scrollIntoViewIfNeeded();
  await expect(answer).not.toBeVisible();
  await question.click();
  await expect(answer).toBeVisible();
  await question.click();
  await expect(answer).not.toBeVisible();
});

test("no fabricated data: illustrative previews stay honest placeholders", async ({ page }) => {
  await page.goto("/welcome", { waitUntil: "load" });
  await expect(page.getByText("Illustrative preview", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Interface example", { exact: true })).toBeVisible();
  // No invented testimonial/customer-count language anywhere on the page.
  const bodyText = await page.locator("body").innerText();
  expect(/testimonial|trusted by|\d[,.]?\d*\+? (customers|users|businesses)/i.test(bodyText)).toBe(
    false,
  );
});

test("no horizontal overflow at mobile width", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/welcome", { waitUntil: "load" });
  await page.waitForTimeout(500);
  const { docWidth, scrollWidth } = await page.evaluate(() => ({
    docWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(docWidth + 1);
});

test("mobile menu opens with full navigation reachable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/welcome", { waitUntil: "load" });
  await page.getByLabel("Open navigation menu").click();
  await expect(page.getByRole("dialog").getByRole("link", { name: "Access C4 OS" })).toBeVisible();
});

test("light mode renders the landing page with light theme tokens", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("c4-theme", "light"));
  await page.goto("/welcome", { waitUntil: "load" });
  await expect(page.locator("html")).toHaveClass(/light/);
  const bg = await page.evaluate(() =>
    getComputedStyle(document.body).getPropertyValue("background-color"),
  );
  // lab()/oklab() lightness is either the first arg (0-100 for lab, 0-1 for oklab).
  const labMatch = bg.match(/^lab\(([\d.]+)/);
  const okMatch = bg.match(/okla?b\(([\d.]+)/);
  const lightness = labMatch ? Number(labMatch[1]) : okMatch ? Number(okMatch[1]) * 100 : null;
  expect(lightness).not.toBeNull();
  expect(lightness as number).toBeGreaterThan(80);
});

test("dark mode renders the landing page with dark theme tokens", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("c4-theme", "dark"));
  await page.goto("/welcome", { waitUntil: "load" });
  await expect(page.locator("html")).toHaveClass(/dark/);
  const bg = await page.evaluate(() =>
    getComputedStyle(document.body).getPropertyValue("background-color"),
  );
  const labMatch = bg.match(/^lab\(([\d.]+)/);
  const okMatch = bg.match(/okla?b\(([\d.]+)/);
  const lightness = labMatch ? Number(labMatch[1]) : okMatch ? Number(okMatch[1]) * 100 : null;
  expect(lightness).not.toBeNull();
  expect(lightness as number).toBeLessThan(20);
});

test("scroll-reveal sections are fully visible once scrolled to, never stuck hidden", async ({
  page,
}) => {
  await page.goto("/welcome", { waitUntil: "load" });
  const heading = page.getByText("Every part of the operation, in one system.", { exact: true });
  await heading.scrollIntoViewIfNeeded();
  await expect(heading).toBeVisible();
  const opacity = await heading.evaluate((el) => getComputedStyle(el).opacity);
  expect(Number(opacity)).toBeGreaterThan(0.9);
});

test("prefers-reduced-motion: content is immediately visible with no stuck-hidden animation state", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/welcome", { waitUntil: "load" });
  // Scroll straight to the bottom without waiting for staged reveals — under
  // reduced motion every section must already be visible, not mid-animation.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(300);
  await expect(page.getByText("Common questions", { exact: true })).toBeVisible();
  const opacity = await page
    .getByText("Common questions", { exact: true })
    .evaluate((el) => getComputedStyle(el).opacity);
  expect(Number(opacity)).toBeGreaterThan(0.9);
});

test("an unauthenticated visitor hitting / is redirected to /welcome", async ({ page }) => {
  await page.goto("/", { waitUntil: "load" });
  await expect(page).toHaveURL(/\/welcome$/);
});

authedTest(
  "an authenticated visitor hitting / is routed straight into the app, not the landing page",
  async ({ page }) => {
    await page.goto("/", { waitUntil: "load" });
    await expect(page).toHaveURL(/\/dashboard$/);
  },
);

authedTest("signing out lands on /welcome, not the old /login form", async ({ page }) => {
  await page.goto("/dashboard", { waitUntil: "load" });
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/welcome$/);
});

test("login page is a clean, form-only sign-in screen linked from /welcome", async ({ page }) => {
  await page.goto("/login", { waitUntil: "load" });
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  // The old two-panel marketing copy is gone — that job now belongs to /welcome.
  await expect(page.getByText("it gets tracked", { exact: false })).toHaveCount(0);
  await page.getByRole("link", { name: "C4 OS" }).click();
  await expect(page).toHaveURL(/\/welcome$/);
});
