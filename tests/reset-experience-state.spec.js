import { test, expect } from '@playwright/test';
import { stateField } from './helpers/state-harness.js';
import { switchView, resetExperienceState } from '@lib/orchestration/lifecycle'

/**
 * Regression test: resetExperienceState must complete within a reasonable timeout and
 * leave the app in a stable idle state.
 *
 * Bug: The e2e-click-flow.spec.js 60s timeout was triggered by cleanup not completing —
 * specifically, WebGL transitions from map → galaxy were not properly awaited, and the
 * viewSwitchPreludeTimer could still be pending after reset, causing the reset to hang.
 *
 * Fix: switchView now guards the prelude timer (it checks state.currentView inside the
 * timer callback before proceeding), and resetExperienceState calls switchView('galaxy')
 * which properly clears the map terrain state and schedules WebGL cleanup.
 *
 * Run: TEST_BASE_URL=http://127.0.0.1:9876 npx playwright test tests/reset-experience-state.spec.js --headed
 */
const BASE_URL = (process.env.TEST_BASE_URL || 'http://127.0.0.1:9876').replace(/\/$/, '');
const SEMANTIC_HEALTH_STUB = {
  ok: true,
  state: 'healthy',
  provenance: { label: 'Search ready', detail: 'Semantic search is ready.' }
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

test.describe('resetExperienceState cleanup regression', () => {
  test('resetExperienceState completes and returns to galaxy view within 15s', async ({ page }) => {
    test.setTimeout(30000);

    await page.goto(`${BASE_URL}/vector-explorer-polished.html`);
    await page.waitForFunction(() => typeof resetExperienceState === 'function', { timeout: 20000 });
    await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))), { timeout: 8000 }).catch(() => {});

    // Establish map view state so reset has something meaningful to do
    await page.evaluate(() => {
      switchView?.('map', { skipTerrainPrelude: true, skipUrlSync: true });
    });
    await page.waitForFunction(() => document.body.dataset.activeView === 'map', { timeout: 10000 });

    // Trigger reset — must complete without hanging
    await page.evaluate(() => {
      resetExperienceState();
    });

    // Must return to galaxy view within 15s (generous — real cleanup is ~1.2s)
    await page.waitForFunction(
      () => document.body.dataset.activeView === 'galaxy',
      null,
      { timeout: 15000 }
    );

    const activeView = await page.evaluate(() => document.body.dataset.activeView);
    expect(activeView).toBe('galaxy');
  });

  test('resetExperienceState clears the search input and results', async ({ page }) => {
    test.setTimeout(30000);

    // Route API calls so search returns results deterministically
    await page.route('**/api.php?action=semantic_lane_health**', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SEMANTIC_HEALTH_STUB) });
    });
    await page.route('**/api.php?action=semantic_search**', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SEARCH_STUB) });
    });

    await page.goto(`${BASE_URL}/vector-explorer-polished.html`);
    await page.waitForFunction(() => typeof resetExperienceState === 'function', { timeout: 20000 });
    await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))), { timeout: 8000 }).catch(() => {});

    // Perform a search so there's state to clear
    const searchInput = page.locator('#search-input');
    await searchInput.focus();
    await searchInput.fill('coffee');
    await page.waitForSelector('.search-result-item', { state: 'visible', timeout: 15000 });
    await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))), { timeout: 8000 }).catch(() => {});

    // Reset
    await page.evaluate(() => {
      resetExperienceState();
    });
    await page.waitForFunction(
      () => document.body.dataset.activeView === 'galaxy',
      null,
      { timeout: 15000 }
    );

    // Search input must be cleared
    const inputValue = await page.evaluate(() => document.getElementById('search-input')?.value ?? '');
    expect(inputValue, 'search input must be cleared after reset').toBe('');

    // Results must be cleared
    const resultsHtml = await page.evaluate(() => document.getElementById('search-results')?.innerHTML ?? '');
    expect(resultsHtml, 'search results must be cleared after reset').toBe('');
  });

  test('resetExperienceState does not leave a pending viewSwitchPreludeTimer', async ({ page }) => {
    test.setTimeout(30000);

    await page.goto(`${BASE_URL}/vector-explorer-polished.html`);
    await page.waitForFunction(() => typeof resetExperienceState === 'function', { timeout: 20000 });
    await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))), { timeout: 8000 }).catch(() => {});

    // Set up a prelude scenario: switch to map with prelude (to start the timer)
    // Then immediately reset — the timer must be cancelled by switchView('galaxy')
    await page.evaluate(() => {
      switchView?.('map', { skipTerrainPrelude: false, skipUrlSync: true });
    });
    // dataset write synchronous // let the prelude timer start

    await page.evaluate(() => {
      resetExperienceState();
    });

    // After reset, no viewSwitchPreludeTimer should be pending
    const timerState = await stateField(page, 'viewSwitchPreludeTimer');

    // null means cleared; a number (timer ID) means it leaked
    expect(timerState, 'viewSwitchPreludeTimer must be null after reset — no leaked timers').toBeNull();
  });
});
