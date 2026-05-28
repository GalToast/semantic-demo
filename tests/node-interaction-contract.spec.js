/**
 * node-interaction-contract.spec.js
 *
 * Contract test proving that clicking a search result item transitions the app
 * into focus mode with the expected state and body surface.
 *
 * Run through the manifest runner or directly:
 *   node tests/run-all-contracts.js --group=scene
 *   npx playwright test tests/node-interaction-contract.spec.js --browser=chromium --workers=1
 */

import { test, expect } from '@playwright/test';

const BASE_URL = (process.env.TEST_BASE_URL || 'http://127.0.0.1:8795').replace(/\/$/, '');

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
  await page.route('**/api.php?action=semantic_lane_health**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SEMANTIC_HEALTH_STUB) })
  );
  await page.route('**/api.php?action=semantic_search**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SEARCH_STUB) })
  );
}

async function openApp(page) {
  await setupMockSearch(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE_URL}/vector-explorer-polished.html?view=galaxy`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => (
    typeof window.clearSearch === 'function' &&
    Array.isArray(window.__TEST_STATE__?.points) &&
    (window.__APP_STATE__ ?? window.__TEST_STATE__).points.length > 0
  ), { timeout: 20000 });
  await page.waitForFunction(() => {
    const overlay = document.getElementById('loading-overlay');
    if (!overlay) return true;
    const styles = getComputedStyle(overlay);
    return overlay.classList.contains('hidden') ||
      styles.display === 'none' ||
      styles.visibility === 'hidden' ||
      styles.pointerEvents === 'none';
  }, { timeout: 20000 });
  await page.waitForTimeout(1200);
}

test.describe('node interaction: search result focus transition', () => {
  test('clicking a search result enters focus mode', async ({ page }) => {
    test.setTimeout(60000);

    await openApp(page);

    const input = page.locator('#search-input');
    await input.focus();
    await input.fill('coffee');
    await page.evaluate(async () => {
      const el = document.getElementById('search-input');
      if (!el) return;
      el.value = 'coffee';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      if (typeof window.search === 'function') {
        await window.search('coffee', { preferCachedResults: false });
      }
    });
    await expect(page.locator('.search-result-item').first()).toBeVisible({ timeout: 15000 });

    await page.locator('.search-result-item').first().click();
    await page.waitForFunction(() => window.__TEST_STATE__?.navState?.mode === 'focus', { timeout: 15000 });

    const result = await page.evaluate(() => ({
      focusedNode: window.__TEST_STATE__?.focusedNode ?? null,
      panelSurface: document.body.dataset.panelSurface || '',
      navMode: window.__TEST_STATE__?.navState?.mode || '',
    }));

    expect(result.focusedNode, 'focusedNode is set after result click').not.toBeNull();
    expect(['focus', 'focus-search'], 'body dataset panel surface').toContain(result.panelSurface);
    expect(result.navMode, 'navState mode').toBe('focus');
  });
});
