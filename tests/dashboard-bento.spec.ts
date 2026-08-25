import { test, expect } from "./fixtures";

/**
 * The "half-empty bento row" bug class — found and fixed multiple times
 * during the original redesign (/traffic, /content-signals, /clients), but
 * never actually committed as a Playwright assertion (the plan said it
 * would be; it wasn't). It regressed on /dashboard: Cash Collected (hero,
 * col-span-2) + Month-End Pace (tall, col-span-1) summed to 3 of the
 * default 4 grid columns, and a 7-card KPI grid left the second row's 4th
 * column empty (7 doesn't divide evenly into 4). Both fixed by sizing the
 * grid to its actual content instead of leaving trailing dead space.
 *
 * Checks geometry, not the fix's specific implementation: for a grid
 * container, group its direct children into rows by vertical position, and
 * assert the first row's rightmost child edge reaches the container's own
 * right edge (within a small tolerance for border/rounding) — a row that
 * stops short of the container's right edge is exactly what a visible gap
 * looks like, regardless of which column-span combination caused it.
 */
async function assertFirstRowFillsWidth(page: import("@playwright/test").Page, containerSelector: string, label: string) {
  const result = await page.evaluate((sel) => {
    const container = document.querySelector(sel);
    if (!container) return { error: `container not found: ${sel}` };
    const containerRect = container.getBoundingClientRect();
    const children = Array.from(container.children) as HTMLElement[];
    if (children.length === 0) return { error: "no children" };
    const firstTop = children[0].getBoundingClientRect().top;
    const firstRow = children.filter((c) => Math.abs(c.getBoundingClientRect().top - firstTop) < 4);
    const rowRight = Math.max(...firstRow.map((c) => c.getBoundingClientRect().right));
    const style = getComputedStyle(container);
    const paddingRight = parseFloat(style.paddingRight || "0");
    return {
      containerRight: containerRect.right - paddingRight,
      rowRight,
      rowCount: firstRow.length,
      totalChildren: children.length,
    };
  }, containerSelector);

  if ("error" in result) throw new Error(`${label}: ${result.error}`);
  // Small tolerance for sub-pixel rounding across the grid gap math — not a
  // fudge for a real gap, real gaps here are tens to hundreds of px.
  expect(result.rowRight, `${label}: first row (${result.rowCount} of ${result.totalChildren} cards) should reach the container's right edge, not stop short leaving a visible gap`).toBeGreaterThan(result.containerRight - 8);
}

test("dashboard: Cash Collected + Month-End Pace row has no trailing gap at 1920px", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1200 });
  await page.goto("/dashboard", { waitUntil: "load" });
  await expect(page.locator("h1")).toContainText("Executive Command Center", { timeout: 20_000 });

  // The hero BentoGrid — first grid on the page after the title block.
  await assertFirstRowFillsWidth(page, "main .grid.grid-cols-1", "Cash Collected / Month-End Pace bento row");
});

test("dashboard: Company KPIs band has no trailing gap at 1920px", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1200 });
  await page.goto("/dashboard", { waitUntil: "load" });
  await expect(page.getByText("Contract Value", { exact: true })).toBeVisible({ timeout: 20_000 });

  // Part 7 replaced the old 2-grid DeltaKpi layout (4-card row + 3-card row,
  // grid-cols-4/grid-cols-3) with the shared KpiBand component, whose grid
  // uses `repeat(auto-fit, minmax(130px, 1fr))` — structurally immune to the
  // "half-empty row" bug class this file exists to catch (auto-fit always
  // stretches to fill the row, no fixed column count to divide unevenly).
  // Still assert it directly rather than assuming the component is correct.
  await assertFirstRowFillsWidth(page, "main .hover-lift .grid.overflow-hidden.rounded-lg", "Company KPIs band");
});
