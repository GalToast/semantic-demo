import { test, expect } from '@playwright/test';

const BASE_URL = (process.env.TEST_BASE_URL || 'http://127.0.0.1:9876').replace(/\/$/, '');

async function enterMapMode(page) {
  await page.waitForFunction(() => typeof window.switchView === 'function', null, { timeout: 20000 });
  await page.evaluate(() => {
    window.switchView('map', {
      skipTerrainPrelude: true,
      skipUrlSync: true,
      silentHandoff: true
    });
  });
  await page.waitForFunction(
    () => document.body.dataset.activeView === 'map',
    null,
    { timeout: 20000 }
  );
  await page.waitForTimeout(200);
}

/**
 * SD-143: Mobile Map mode search restore — contract smoke
 *
 * Validates that in mobile viewport (390×844) with `data-active-view="map"`:
 *   1. The search container is visible and has pointer-events enabled
 *   2. The search input has practical tap-target dimensions
 *   3. The info-panel is visible (not hidden by layout_base/strands overrides)
 *   4. stats-row, demo-starters, selected-card are hidden in map mode
 *   5. Search container has map-mode visual treatment (bg, border-radius, shadow)
 *
 * CSS being verified lives in:
 *   css/mobile_premium_state.css  lines 147–183
 *   (owned by SD-143 — not edited by this agent)
 *
 * Run: TEST_BASE_URL=http://127.0.0.1:9876 npx playwright test tests/sd143-map-search-visual.spec.js
 */

test.describe('SD-143: mobile Map mode search visibility', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  });

  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/vector-explorer-polished.html`);
    await expect(page.locator('.search-container')).toBeVisible({ timeout: 20000 });
    await page.waitForTimeout(1500);
  });

  test('search container and input are visible with pointer-events auto in Map mode', async ({ page }) => {
    test.setTimeout(60000);

    await enterMapMode(page);

    await expect(page.locator('body')).toHaveAttribute('data-active-view', 'map', { timeout: 10000 });

    const searchContainer = page.locator('.search-container');
    await expect(searchContainer).toBeVisible({ timeout: 10000 });

    const containerDisplay = await searchContainer.evaluate((el) => getComputedStyle(el).display);
    expect(containerDisplay).not.toBe('none');

    const containerPointerEvents = await searchContainer.evaluate((el) => getComputedStyle(el).pointerEvents);
    expect(containerPointerEvents).toBe('auto');

    const searchInput = page.locator('.search-input');
    await expect(searchInput).toBeVisible({ timeout: 5000 });
    const inputPointerEvents = await searchInput.evaluate((el) => getComputedStyle(el).pointerEvents);
    expect(inputPointerEvents).toBe('auto');
  });

  test('search input has practical tap-target dimensions in Map mode', async ({ page }) => {
    test.setTimeout(60000);

    await enterMapMode(page);

    const searchInput = page.locator('.search-input');
    await expect(searchInput).toBeVisible({ timeout: 10000 });

    const box = await searchInput.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    });

    const MIN_TAP = 44;
    expect(box.width, `search input width (${box.width}px)`).toBeGreaterThanOrEqual(MIN_TAP);
    expect(box.height, `search input height (${box.height}px)`).toBeGreaterThanOrEqual(MIN_TAP);
  });

  test('info-panel is visible and not hidden by layout_base/strands overrides in Map mode', async ({ page }) => {
    test.setTimeout(60000);

    await enterMapMode(page);

    const infoPanel = page.locator('.info-panel');
    await expect(infoPanel).toBeVisible({ timeout: 10000 });

    const panelDisplay = await infoPanel.evaluate((el) => getComputedStyle(el).display);
    const panelVisibility = await infoPanel.evaluate((el) => getComputedStyle(el).visibility);
    const panelOpacity = await infoPanel.evaluate((el) => getComputedStyle(el).opacity);

    expect(panelDisplay).not.toBe('none');
    expect(panelVisibility).not.toBe('hidden');
    expect(Number(panelOpacity)).toBeGreaterThan(0);
  });

  test('stats-row, demo-starters, selected-card are hidden in Map mode', async ({ page }) => {
    test.setTimeout(60000);

    await enterMapMode(page);

    const hiddenSelectors = ['.stats-row', '.demo-starters', '.selected-card'];
    for (const selector of hiddenSelectors) {
      const count = await page.locator(selector).count();
      if (count > 0) {
        const display = await page.locator(selector).evaluate((el) => getComputedStyle(el).display);
        expect(display, `${selector} display in map mode`).toBe('none');
      }
    }
  });

  test('search container has map-mode visual treatment (bg color, border-radius, shadow)', async ({ page }) => {
    test.setTimeout(60000);

    await enterMapMode(page);

    const searchContainer = page.locator('.search-container');
    await expect(searchContainer).toBeVisible({ timeout: 10000 });

    const bgColor     = await searchContainer.evaluate((el) => getComputedStyle(el).backgroundColor);
    const borderRadius = await searchContainer.evaluate((el) => getComputedStyle(el).borderRadius);
    const boxShadow   = await searchContainer.evaluate((el) => getComputedStyle(el).boxShadow);
    const borderColor = await searchContainer.evaluate((el) => getComputedStyle(el).borderColor);

    expect(bgColor).toMatch(/rgba?\(15,\s*15,\s*25/i);
    expect(borderRadius).toBe('12px');
    expect(boxShadow).not.toBe('none');
    expect(borderColor).not.toBe('rgba(0, 0, 0, 0)');
  });
});
