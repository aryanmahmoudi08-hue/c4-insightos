const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
  await page.addInitScript(() => sessionStorage.setItem("c4-dev-bypass", "1"));
  await page.goto('http://localhost:8080/dashboard', { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/tmp/sidebar-collapsed-sections.png' });
  // Expand Sales and Marketing to verify nesting
  await page.getByText('Sales', { exact: true }).click();
  await page.waitForTimeout(300);
  await page.getByText('Marketing', { exact: true }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: '/tmp/sidebar-expanded.png' });
  await browser.close();
})();
