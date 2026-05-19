import { test, expect } from '@playwright/test';

const BASE_URL = (process.env.TEST_BASE_URL || 'http://127.0.0.1:8766').replace(/\/$/, '');
const APP_PATH = process.env.TEST_APP_PATH || '/vector-explorer-polished.html';
const SEMANTIC_HEALTH_STUB = {
  ok: true,
  state: 'healthy',
  provenance: {
    label: 'Search ready',
    detail: 'Semantic search is ready.'
  }
};
const SEARCH_STUB = {
  ok: true,
  count: 3,
  results: [
    { lead_id: 1, score: 0.99, semantic_score: 0.99, public_note: 'Coffee-relevant local business result.' },
    { lead_id: 2, score: 0.91, semantic_score: 0.91, public_note: 'Nearby hospitality result.' },
    { lead_id: 20, score: 0.86, semantic_score: 0.86, public_note: 'Related local service result.' }
  ]
};

test('E2E Semantic Explorer Click Flow', async ({ page }) => {
  test.setTimeout(60000);
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route('**/api.php?action=semantic_lane_health**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(SEMANTIC_HEALTH_STUB)
    });
  });
  await page.route('**/api.php?action=semantic_search**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(SEARCH_STUB)
    });
  });

  // 1. Initial Load
  await page.goto(`${BASE_URL}${APP_PATH}`);
  await expect(page).toHaveTitle(/Semantic Explorer|MoCo Business Mycelium/);
  await page.waitForSelector('#search-input', { state: 'visible', timeout: 15000 });
  await page.waitForTimeout(2000);

  // 2. Perform Search
  const searchInput = page.locator('#search-input');
  await searchInput.focus();
  await searchInput.fill('coffee');
  await page.waitForSelector('.search-result-item', { state: 'visible', timeout: 15000 });
  await page.waitForTimeout(2000);

  // 3. Focus / Step Inside
  await page.locator('.search-result-item').first().click();
  await page.waitForTimeout(3000);

  // 4. Switch to Map Mode
  await page.click('#btn-map');
  await page.waitForTimeout(3000);

  // 5. Share Button (Clipboard)
  await page.click('#btn-share-view', { force: true });
  await page.waitForTimeout(1000);
  const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboardText).toContain('view=map');
  expect(clipboardText).toContain('q=coffee');

  // 6. Reset
  await page.evaluate(() => {
    if (typeof window.resetExperienceState === 'function') {
      window.resetExperienceState();
    }
  });
  await page.waitForTimeout(2000);
});

test.afterEach(async ({ page }) => {
  await page.evaluate(() => {
    localStorage.removeItem('moco_mycelium_demo_v1');
    sessionStorage.clear();
  });
});
