import { test, expect } from '@playwright/test';
import { SNAPSHOT_FIELDS, snapshot, stateField } from '../helpers/state-harness.js';

const BASE_URL = (process.env.TEST_BASE_URL || 'http://127.0.0.1:8795').replace(/\/$/, '');

const VIEWPORTS = [
  { name: 'desktop', viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false },
  { name: 'mobile', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
];

const SEMANTIC_HEALTH_STUB = {
  ok: true,
  state: 'healthy',
  provenance: { label: 'Search ready', detail: 'Semantic search is ready.' },
};

const SEARCH_STUB = {
  ok: true,
  count: 3,
  results: [
    { lead_id: 1, score: 0.99, semantic_score: 0.99, public_note: 'Coffee shop on Main St.' },
    { lead_id: 2, score: 0.91, semantic_score: 0.91, public_note: 'Cafe near the park.' },
    { lead_id: 20, score: 0.86, semantic_score: 0.86, public_note: 'Espresso bar downtown.' },
  ],
};

async function setupMockSearch(page) {
  await page.route('**/api.php?action=semantic_lane_health**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(SEMANTIC_HEALTH_STUB),
    });
  });

  await page.route('**/api.php?action=semantic_search**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(SEARCH_STUB),
    });
  });
}

async function enterSearchQuery(page, query) {
  const input = page.locator('#search-input');
  await input.focus();
  await input.fill(query);
  await page.evaluate(value => {
    const input = document.getElementById('search-input');
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, query);
}

for (const viewportProfile of VIEWPORTS) {
  test.describe(`dewindowing live reset proof [${viewportProfile.name}]`, () => {
    test.use({
      viewport: viewportProfile.viewport,
      isMobile: viewportProfile.isMobile,
      hasTouch: viewportProfile.hasTouch,
    });

    test('mocked semantic search clears through the real Escape key path', async ({ page }) => {
      test.setTimeout(60000);

      await setupMockSearch(page);
      await page.goto(`${BASE_URL}/vector-explorer-polished.html`);
      await page.waitForFunction(() => typeof (window.__APP_ACTIONS__?.clearSearch) === 'function', { timeout: 20000 });

      await enterSearchQuery(page, 'coffee');
      await page.waitForSelector('.search-result-item', { state: 'visible', timeout: 15000 });

      const beforeReset = await page.evaluate(() => ({
        inputValue: document.getElementById('search-input')?.value ?? '',
        resultsCount: document.querySelectorAll('.search-result-item').length,
        hasQuery: document.querySelector('.search-container')?.classList.contains('has-query') ?? false,
      }));
      beforeReset.navMode = await stateField(page, 'navState.mode') ?? 'unknown';

      expect(beforeReset.inputValue).toBe('coffee');
      expect(beforeReset.resultsCount).toBeGreaterThan(0);
      expect(beforeReset.hasQuery).toBe(true);

      await page.keyboard.press('Escape');
      await expect(page.locator('.search-result-item')).toHaveCount(0, { timeout: 10000 });

      const afterReset = await page.evaluate(() => ({
        inputValue: document.getElementById('search-input')?.value ?? '',
        resultsCount: document.querySelectorAll('.search-result-item').length,
      }));
      const afterState = await snapshot(page, SNAPSHOT_FIELDS.focusTrail);
      Object.assign(afterReset, {
        focusedNode: afterState.focusedNode ?? null,
        selectedPoint: afterState.selectedPoint ?? null,
        trailDepth: afterState.trailDepth ?? -1,
        navMode: afterState['navState.mode'] ?? 'unknown',
      });

      expect(afterReset.inputValue, 'Escape must clear search input').toBe('');
      expect(afterReset.resultsCount, 'Escape must clear rendered search results').toBe(0);
      expect(afterReset.focusedNode, 'Escape must clear focusedNode').toBeNull();
      expect(afterReset.selectedPoint, 'Escape must clear selectedPoint').toBeNull();
      expect(afterReset.trailDepth, 'Escape must reset trailDepth to 0').toBe(0);
      expect(afterReset.navMode, 'Escape must return to overview mode').toBe('overview');
      await expect(page.locator('#search-clear-btn')).not.toBeVisible();
    });
  });
}
