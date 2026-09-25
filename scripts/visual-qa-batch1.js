const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const outDir = 'reports/screenshots/visual-qa-bugsweep';
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext();

  // 1. Desktop idle
  const pageDesktop = await context.newPage({ viewport: { width: 1440, height: 900 } });
  await pageDesktop.goto('http://127.0.0.1:8795/vector-explorer-polished.html', { waitUntil: 'networkidle' });
  await pageDesktop.waitForTimeout(3000);
  await pageDesktop.screenshot({ path: `${outDir}/desktop-idle.png`, fullPage: true });

  // 2. Mobile idle
  await pageDesktop.setViewportSize({ width: 375, height: 812 });
  await pageDesktop.reload({ waitUntil: 'networkidle' });
  await pageDesktop.waitForTimeout(3000);
  await pageDesktop.screenshot({ path: `${outDir}/mobile-idle.png`, fullPage: true });

  // 3. Mobile landscape
  await pageDesktop.setViewportSize({ width: 900, height: 430 });
  await pageDesktop.reload({ waitUntil: 'networkidle' });
  await pageDesktop.waitForTimeout(3000);
  await pageDesktop.screenshot({ path: `${outDir}/mobile-landscape.png`, fullPage: true });

  // 4. Search results - desktop
  await pageDesktop.setViewportSize({ width: 1440, height: 900 });
  await pageDesktop.reload({ waitUntil: 'networkidle' });
  await pageDesktop.waitForTimeout(2000);
  await pageDesktop.fill('input[type="search"], .search-input, #search-input, [placeholder*="Search"]', 'cafe');
  await pageDesktop.waitForTimeout(1500);
  await pageDesktop.screenshot({ path: `${outDir}/search-results.png`, fullPage: true });

  await browser.close();
  console.log('Done with first batch');
})();
