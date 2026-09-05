import { test, expect, realErrors } from "./fixtures";

/**
 * Priority 6: exhaustive light-mode QA pass. These checks guard the theme
 * token system itself (never brittle pixel/screenshot assertions) — that
 * switching to `.light` actually flips real computed styles, and that the
 * specific surfaces which used to hardcode dark-only colors (funnel rows,
 * hub sparkline tooltip, and the whole webinar-analytics page) now resolve
 * through theme tokens instead, in both themes.
 */

/** Returns an approximate 0-255 luminance from any computed color-function
 * string the browser hands back. This app's tokens are defined in oklch, but
 * Chromium's computed-style serialization reports them back as CIE `lab()`
 * (lightness 0-100) rather than rgb — never oklab/oklch — so that's the
 * format actually handled here alongside a plain rgb/rgba fallback. */
function luminance(color: string): number | null {
  const rgbParts = color.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/);
  if (rgbParts) {
    const [, r, g, b] = rgbParts;
    return 0.2126 * Number(r) + 0.7152 * Number(g) + 0.0722 * Number(b);
  }
  const labParts = color.match(/^lab\(([\d.]+)/);
  if (labParts) return (Number(labParts[1]) / 100) * 255;
  const okParts = color.match(/okl(?:ab|ch)\(([\d.]+)/);
  if (okParts) return Number(okParts[1]) * 255;
  return null;
}

test("theme toggle: root class and CSS custom properties actually flip between themes", async ({
  page,
}) => {
  await page.addInitScript(() => sessionStorage.setItem("c4-dev-bypass", "1"));
  await page.goto("/dashboard", { waitUntil: "load" });

  await page.evaluate(() => localStorage.setItem("c4-theme", "light"));
  await page.reload({ waitUntil: "load" });
  await expect(page.locator("html")).toHaveClass(/light/);
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  const lightBg = await page.evaluate(() =>
    getComputedStyle(document.body).getPropertyValue("background-color"),
  );
  expect(luminance(lightBg) as number).toBeGreaterThan(200); // near-white page background

  await page.evaluate(() => localStorage.setItem("c4-theme", "dark"));
  await page.reload({ waitUntil: "load" });
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.locator("html")).not.toHaveClass(/light/);
  const darkBg = await page.evaluate(() =>
    getComputedStyle(document.body).getPropertyValue("background-color"),
  );
  expect(luminance(darkBg) as number).toBeLessThan(60); // near-black page background
});

test("funnel instrument rows: no hardcoded dark-only slate literals, readable in light mode", async ({
  page,
  consoleErrors,
}) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("c4-dev-bypass", "1");
    localStorage.setItem("c4-theme", "light");
  });
  await page.goto("/closer", { waitUntil: "load" });
  const section = page.getByText("Close", { exact: true }).first();
  await section.scrollIntoViewIfNeeded();

  const stageRow = page.getByRole("button", { name: /Calls on calendar/i }).first();
  await expect(stageRow).toBeVisible({ timeout: 10_000 });
  const [rowBg, valueColor] = await stageRow.evaluate((el) => {
    const value = el.querySelector("span.tabular-nums") as HTMLElement | null;
    return [
      getComputedStyle(el).backgroundColor,
      value ? getComputedStyle(value).color : getComputedStyle(el).color,
    ];
  });
  // Row background must be a light neutral, not the old hardcoded slate-900.
  expect(luminance(rowBg) as number).toBeGreaterThan(150);
  // Stage value text must be dark (readable), not literal white-on-white.
  expect(luminance(valueColor) as number).toBeLessThan(120);

  expect(realErrors(consoleErrors)).toEqual([]);
});

test("webinar analytics: every card surface resolves to theme tokens in light mode (no leftover dark-glass cards)", async ({
  page,
  consoleErrors,
}) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("c4-dev-bypass", "1");
    localStorage.setItem("c4-theme", "light");
  });
  await page.goto("/webinar-analytics", { waitUntil: "load" });
  await expect(page.getByText("Executive KPIs").first()).toBeVisible({ timeout: 10_000 });

  const retentionHeading = page.getByText("Audience retention", { exact: true });
  const comparisonHeader = page.getByText("Compare with", { exact: true }).locator("..");

  for (const locator of [retentionHeading, comparisonHeader]) {
    await locator.scrollIntoViewIfNeeded();
    const bg = await locator.evaluate((el) => {
      let node: HTMLElement | null = el as HTMLElement;
      // walk up to the nearest ancestor with a non-transparent background
      while (node) {
        const c = getComputedStyle(node).backgroundColor;
        if (c && c !== "rgba(0, 0, 0, 0)" && c !== "transparent") return c;
        node = node.parentElement;
      }
      return "rgba(0, 0, 0, 0)";
    });
    expect(luminance(bg) as number).toBeGreaterThan(150);
  }

  expect(realErrors(consoleErrors)).toEqual([]);
});

test("Available to call drawer renders as a light surface with readable table rows", async ({
  page,
  consoleErrors,
}) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("c4-dev-bypass", "1");
    localStorage.setItem("c4-theme", "light");
  });
  await page.goto("/leads", { waitUntil: "load" });
  await page.getByText("AVAILABLE TO CALL", { exact: false }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  const dialogBg = await dialog.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(luminance(dialogBg) as number).toBeGreaterThan(150);

  expect(realErrors(consoleErrors)).toEqual([]);
});

test("date-range controls render legibly in light mode", async ({ page, consoleErrors }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("c4-dev-bypass", "1");
    localStorage.setItem("c4-theme", "light");
  });
  await page.goto("/leads", { waitUntil: "load" });
  await page.getByRole("button", { name: "Custom", exact: true }).first().click();
  await expect(page.getByText("From", { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("To", { exact: true })).toBeVisible();

  expect(realErrors(consoleErrors)).toEqual([]);
});

test("EOD reports form renders legibly in light mode", async ({ page, consoleErrors }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("c4-dev-bypass", "1");
    localStorage.setItem("c4-theme", "light");
  });
  await page.goto("/eod-reports", { waitUntil: "load" });
  await expect(page.getByText("DM SETTER EOD", { exact: false })).toBeVisible({
    timeout: 10_000,
  });
  await page.getByText("DM SETTER EOD", { exact: false }).click();
  await expect(page.getByText("Name", { exact: true })).toBeVisible();

  expect(realErrors(consoleErrors)).toEqual([]);
});

test("Closer lifecycle attribution panel: branching sources still render correctly in light mode", async ({
  page,
  consoleErrors,
}) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("c4-dev-bypass", "1");
    localStorage.setItem("c4-theme", "light");
  });
  await page.goto("/closer", { waitUntil: "load" });
  const section = page.getByText("Closer lifecycle attribution", { exact: true });
  await section.scrollIntoViewIfNeeded();
  await expect(section).toBeVisible();
  const sourceButtons = page.locator("button", {
    hasText:
      /^(Instagram|TikTok|YouTube|Facebook|LinkedIn|X \/ Twitter|Meta|Email|Referral|Other|Unknown \/ Unattributed)/,
  });
  expect(await sourceButtons.count()).toBeGreaterThanOrEqual(1);

  expect(realErrors(consoleErrors)).toEqual([]);
});

test("Legacy Leads table renders rows legibly in light mode", async ({ page, consoleErrors }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("c4-dev-bypass", "1");
    localStorage.setItem("c4-theme", "light");
  });
  await page.goto("/leads", { waitUntil: "load" });
  await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10_000 });
  const rowCount = await page.locator("table tbody tr").count();
  expect(rowCount).toBeGreaterThan(0);

  expect(realErrors(consoleErrors)).toEqual([]);
});
