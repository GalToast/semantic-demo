import { test, expect } from '@playwright/test';

/**
 * Live reset interaction proof — Wave 2
 *
 * Flow: mock search → focus/exploration state → Escape → clearSearch + resetExplorationFocus
 *
 * Validates:
 *  - returnToOverview() / resetExplorationFocus() exist and are wired to Escape
 *  - Escape clears search input + results deterministically
 *  - resetExplorationFocus resets navState.mode to 'overview' and hides focus stage
 *  - No leaked timers after reset
 *
 * Run:
 *   TEST_BASE_URL=http://127.0.0.1:9876 npx playwright test tests/live-reset-proof-wave2.spec.js --browser=chromium --headed
 */
const BASE_URL = (process.env.TEST_BASE_URL || 'http://127.0.0.1:8795').replace(/\/$/, '');

const SEMANTIC_HEALTH_STUB = {
  ok: true,
  state: 'healthy',
  provenance: { label: 'Search ready', detail: 'Semantic search is ready.' }
};

const SEARCH_STUB = {
  ok: true,
  count: 3,
  results: [
    { lead_id: 1, score: 0.99, semantic_score: 0.99, public_note: 'Coffee shop on Main St.' },
    { lead_id: 2, score: 0.91, semantic_score: 0.91, public_note: 'Café near the park.' },
    { lead_id: 20, score: 0.86, semantic_score: 0.86, public_note: 'Espresso bar downtown.' }
  ]
};

async function performMockedSearch(page, query = 'coffee') {
  const searchInput = page.locator('#search-input');
  await searchInput.focus();
  await searchInput.fill(query);

  try {
    await page.waitForSelector('.search-result-item', { state: 'visible', timeout: 8000 });
    return;
  } catch {
    await page.evaluate((searchQuery) => {
      if (typeof (window.__APP_ACTIONS__?.search) === 'function') {
        (window.__APP_ACTIONS__?.search)(searchQuery);
      }
    }, query);
    await page.waitForSelector('.search-result-item', { state: 'visible', timeout: 15000 });
  }
}

test.describe('Live reset: Escape → clearSearch + resetExplorationFocus', () => {

  test.beforeEach(async ({ page }) => {
    // Reset timers so stale-check doesn't interfere
    await page.evaluate(() => {
      if (window.__TEST_STATE__) {
        (window.__APP_STATE__ ?? window.__TEST_STATE__).viewSwitchPreludeTimer = null;
        (window.__APP_STATE__ ?? window.__TEST_STATE__).searchTimeout = null;
      }
    });
  });

  test('Escape clears search, resets focus mode, returns to overview without leaked timers', async ({ page }) => {
    test.setTimeout(30000);

    // Route API to use mocked responses
    await page.route('**/api.php?action=semantic_lane_health**', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SEMANTIC_HEALTH_STUB) });
    });
    await page.route('**/api.php?action=semantic_search**', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SEARCH_STUB) });
    });

    await page.goto(`${BASE_URL}/vector-explorer-polished.html`);
    await page.waitForFunction(() => typeof (window.__APP_ACTIONS__?.resetExplorationFocus) === 'function', { timeout: 20000 });
    await page.waitForTimeout(1500);

    // --- 1. Perform search ---
    await performMockedSearch(page);
    await page.waitForTimeout(1000);

    // Verify search state is populated
    const searchStateBefore = await page.evaluate(() => ({
      inputValue: document.getElementById('search-input')?.value ?? '',
      hasResults: (document.getElementById('search-results')?.querySelector('.search-result-item') ?? null) !== null,
      currentView: document.body.dataset.activeView
    }));
    expect(searchStateBefore.inputValue).toBe('coffee');
    expect(searchStateBefore.hasResults).toBe(true);

    // --- 2. Click a result → enter focus/exploration state ---
    await page.locator('.search-result-item').first().click();
    await page.waitForTimeout(2000);

    // Verify focus mode is active
    const focusStateBefore = await page.evaluate(() => ({
      navMode: window.__TEST_STATE__?.navState?.mode ?? 'unknown',
      focusedNode: window.__TEST_STATE__?.focusedNode ?? null,
      selectedPoint: window.__TEST_STATE__?.selectedPoint !== null
    }));
    expect(focusStateBefore.navMode).toBe('focus');
    expect(focusStateBefore.focusedNode).not.toBeNull();

    // --- 3. Press Escape → should trigger clearSearch + resetExplorationFocus ---
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1500);

    // --- 4. Verify reset outcomes ---

    // Search input cleared
    const inputValue = await page.evaluate(() => document.getElementById('search-input')?.value ?? '');
    expect(inputValue, 'search input must be cleared after Escape').toBe('');

    // Results cleared
    const resultsHtml = await page.evaluate(() => document.getElementById('search-results')?.innerHTML ?? '');
    expect(resultsHtml, 'search results must be cleared after Escape').toBe('');

    // Nav mode reset to overview
    const navMode = await page.evaluate(() => window.__TEST_STATE__?.navState?.mode ?? 'unknown');
    expect(navMode, 'navState.mode must be reset to overview after Escape').toBe('overview');

    // Focus node cleared
    const focusedNode = await page.evaluate(() => window.__TEST_STATE__?.focusedNode);
    expect(focusedNode, 'focusedNode must be null after Escape').toBeNull();

    // No leaked timers
    const timerState = await page.evaluate(() => ({
      viewSwitchPreludeTimer: window.__TEST_STATE__?.viewSwitchPreludeTimer ?? null,
      searchTimeout: window.__TEST_STATE__?.searchTimeout ?? null
    }));
    expect(timerState.viewSwitchPreludeTimer, 'viewSwitchPreludeTimer must be null after Escape').toBeNull();
    expect(timerState.searchTimeout, 'searchTimeout must be null after Escape').toBeNull();
  });

  test('resetExplorationFocus preserves search input when called directly', async ({ page }) => {
    test.setTimeout(30000);

    await page.route('**/api.php?action=semantic_lane_health**', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SEMANTIC_HEALTH_STUB) });
    });
    await page.route('**/api.php?action=semantic_search**', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SEARCH_STUB) });
    });

    await page.goto(`${BASE_URL}/vector-explorer-polished.html`);
    await page.waitForFunction(() => typeof (window.__APP_ACTIONS__?.resetExplorationFocus) === 'function', { timeout: 20000 });
    await page.waitForTimeout(1500);

    // Enter focus state via search click
    await performMockedSearch(page);
    await page.waitForTimeout(1000);
    await page.locator('.search-result-item').first().click();
    await page.waitForTimeout(2000);

    // Call resetExplorationFocus directly (preserves search per its contract)
    await page.evaluate(() => {
      (window.__APP_ACTIONS__?.resetExplorationFocus)();
    });
    await page.waitForTimeout(1000);

    // Search input should still have 'coffee' (preserveSearch: true)
    const inputValue = await page.evaluate(() => document.getElementById('search-input')?.value ?? '');
    expect(inputValue, 'resetExplorationFocus must preserve search input').toBe('coffee');

    // But focus should be cleared
    const navMode = await page.evaluate(() => window.__TEST_STATE__?.navState?.mode ?? 'unknown');
    expect(navMode, 'navState.mode must be overview after resetExplorationFocus').toBe('overview');

    const focusedNode = await page.evaluate(() => window.__TEST_STATE__?.focusedNode);
    expect(focusedNode, 'focusedNode must be null after resetExplorationFocus').toBeNull();
  });

  test('returnToOverview is alias for resetExperienceState (full reset)', async ({ page }) => {
    test.setTimeout(30000);

    await page.route('**/api.php?action=semantic_lane_health**', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SEMANTIC_HEALTH_STUB) });
    });
    await page.route('**/api.php?action=semantic_search**', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SEARCH_STUB) });
    });

    await page.goto(`${BASE_URL}/vector-explorer-polished.html`);
    await page.waitForFunction(() => typeof (window.__APP_ACTIONS__?.returnToOverview) === 'function', { timeout: 20000 });
    await page.waitForTimeout(1500);

    // Establish search + focus state
    await performMockedSearch(page);
    await page.waitForTimeout(1000);
    await page.locator('.search-result-item').first().click();
    await page.waitForTimeout(2000);

    // returnToOverview = full reset (clears search too)
    await page.evaluate(() => {
      (window.__APP_ACTIONS__?.returnToOverview)();
    });
    await page.waitForFunction(
      () => document.body.dataset.activeView === 'galaxy',
      null,
      { timeout: 15000 }
    );

    const inputValue = await page.evaluate(() => document.getElementById('search-input')?.value ?? '');
    expect(inputValue, 'returnToOverview must clear search input').toBe('');

    const navMode = await page.evaluate(() => window.__TEST_STATE__?.navState?.mode ?? 'unknown');
    expect(navMode).toBe('overview');

    const activeView = await page.evaluate(() => document.body.dataset.activeView);
    expect(activeView).toBe('galaxy');
  });

  test('btn-focus-overview triggers resetExplorationFocus', async ({ page }) => {
    test.setTimeout(30000);

    await page.route('**/api.php?action=semantic_lane_health**', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SEMANTIC_HEALTH_STUB) });
    });
    await page.route('**/api.php?action=semantic_search**', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SEARCH_STUB) });
    });

    await page.goto(`${BASE_URL}/vector-explorer-polished.html`);
    await page.waitForFunction(() => typeof (window.__APP_ACTIONS__?.resetExplorationFocus) === 'function', { timeout: 20000 });
    await page.waitForTimeout(1500);

    // Enter focus state
    await performMockedSearch(page);
    await page.waitForTimeout(1000);
    await page.locator('.search-result-item').first().click();
    await page.waitForTimeout(2000);

    // Click btn-focus-overview
    await page.click('#btn-focus-overview');
    await page.waitForTimeout(1500);

    const navMode = await page.evaluate(() => window.__TEST_STATE__?.navState?.mode ?? 'unknown');
    expect(navMode, 'btn-focus-overview must reset mode to overview').toBe('overview');
  });
});
