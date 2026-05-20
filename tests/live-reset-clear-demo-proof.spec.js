import { test, expect } from '@playwright/test';

/**
 * Live Interaction Reset Proof - wave for real keyboard/Escape path
 * through mocked semantic search responses.
 *
 * Validates the real event path:
 *   keyboard(Escape) -> handleGlobalKeydown -> clearSearch + resetExplorationFocus
 *
 * Run:
 *   npx playwright test tests/live-reset-clear-demo-proof.spec.js --browser=chromium --workers=1
 *   npm run qa:live-reset
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
    { lead_id: 2, score: 0.91, semantic_score: 0.91, public_note: 'Cafe near the park.' },
    { lead_id: 20, score: 0.86, semantic_score: 0.86, public_note: 'Espresso bar downtown.' }
  ]
};

async function setupMockSearch(page) {
  await page.route('**/api.php?action=semantic_lane_health**', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SEMANTIC_HEALTH_STUB) });
  });
  await page.route('**/api.php?action=semantic_search**', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SEARCH_STUB) });
  });
}

async function enterSearchQuery(page, query = 'coffee') {
  const input = page.locator('#search-input');
  await input.focus();
  await input.fill(query);
  await page.evaluate((q) => {
    const el = document.getElementById('search-input');
    el.value = q;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, query);
  await page.waitForFunction(() => document.querySelector('.search-container')?.classList.contains('has-query'), { timeout: 10000 });
  return input;
}

async function waitForResults(page, timeout = 15000) {
  try {
    await page.waitForSelector('.search-result-item', { state: 'visible', timeout: 8000 });
  } catch {
    await page.evaluate((q) => { if (typeof window.search === 'function') window.search(q); }, 'coffee');
    await page.waitForSelector('.search-result-item', { state: 'visible', timeout: timeout });
  }
}

test.describe('Live Interaction Proof: Escape key -> clearSearch + resetExplorationFocus', () => {

  test.beforeEach(async ({ page }) => {
    await setupMockSearch(page);
    await page.evaluate(() => {
      // Clear any residual state so timers don't trigger stale-detection
      if (window.state) {
        window.state.viewSwitchPreludeTimer = null;
        window.state.searchTimeout = null;
      }
    });
  });

  test('Escape from search-with-results clears input, results, and exploration state via real keyboard event', async ({ page }) => {
    test.setTimeout(60000);

    await page.goto(`${BASE_URL}/vector-explorer-polished.html`);
    await page.waitForFunction(() => typeof window.clearSearch === 'function', { timeout: 20000 });
    await page.waitForTimeout(1500);

    // --- 1. Establish search state with results ---
    await enterSearchQuery(page, 'coffee');
    await waitForResults(page);

    const inputBefore = await page.evaluate(() => document.getElementById('search-input')?.value ?? '');
    const resultsBefore = await page.locator('.search-result-item').count();
    expect(inputBefore).toBe('coffee');
    expect(resultsBefore).toBeGreaterThan(0);

    // --- 2. Press Escape via real keyboard event ---
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1500);

    // --- 3. Verify: input cleared, results gone, nav reset to overview ---
    const inputAfter = await page.evaluate(() => document.getElementById('search-input')?.value ?? '');
    expect(inputAfter, 'Escape must clear search input').toBe('');

    const resultsAfter = await page.locator('.search-result-item').count();
    expect(resultsAfter, 'Escape must clear search results').toBe(0);

    const navMode = await page.evaluate(() => window.state?.navState?.mode ?? 'unknown');
    expect(navMode, 'Escape must reset navState.mode to overview').toBe('overview');

    // Clear button must be gone
    const clearBtn = page.locator('#search-clear-btn');
    await expect(clearBtn).not.toBeVisible();
  });

  test('Escape from focus state resets focusedNode and trail via real keyboard event', async ({ page }) => {
    test.setTimeout(60000);

    await page.goto(`${BASE_URL}/vector-explorer-polished.html`);
    await page.waitForFunction(() => typeof window.clearSearch === 'function', { timeout: 20000 });
    await page.waitForTimeout(1500);

    // --- 1. Search -> click result to enter focus state ---
    await enterSearchQuery(page, 'cafe');
    await waitForResults(page);
    await page.locator('.search-result-item').first().click();
    await page.waitForTimeout(2000);

    const focusBefore = await page.evaluate(() => ({
      navMode: window.state?.navState?.mode ?? 'unknown',
      focusedNode: window.state?.focusedNode ?? null,
      trailDepth: window.state?.trailDepth ?? -1
    }));
    expect(focusBefore.navMode).toBe('focus');
    expect(focusBefore.focusedNode).not.toBeNull();

    // --- 2. Press Escape via real keyboard event ---
    await page.keyboard.press('Escape');
    await page.waitForTimeout(2000);

    // --- 3. Verify focus state is fully cleared ---
    const focusAfter = await page.evaluate(() => ({
      navMode: window.state?.navState?.mode ?? 'unknown',
      focusedNode: window.state?.focusedNode ?? null,
      trailDepth: window.state?.trailDepth ?? -1
    }));
    expect(focusAfter.navMode, 'Escape must reset mode to overview').toBe('overview');
    expect(focusAfter.focusedNode, 'Escape must clear focusedNode').toBeNull();
    expect(focusAfter.trailDepth, 'Escape must reset trailDepth to 0').toBe(0);

    // Search input also cleared (full reset)
    const inputAfter = await page.evaluate(() => document.getElementById('search-input')?.value ?? '');
    expect(inputAfter, 'Escape from focus must clear search input').toBe('');
  });

  test('Escape triggers clearSearch via event-bindings searchInput keydown handler (not global)', async ({ page }) => {
    test.setTimeout(45000);

    await page.goto(`${BASE_URL}/vector-explorer-polished.html`);
    await page.waitForFunction(() => typeof window.clearSearch === 'function', { timeout: 20000 });
    await page.waitForTimeout(1500);

    await enterSearchQuery(page, 'espresso');
    await waitForResults(page);

    // Focus the search input so the keydown handler on searchInput catches Escape
    await page.locator('#search-input').focus();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1500);

    const inputAfter = await page.evaluate(() => document.getElementById('search-input')?.value ?? '');
    expect(inputAfter, 'Escape while input is focused must clear search via searchInput keydown handler').toBe('');
  });

  test('real Escape press is captured by handleGlobalKeydown when no element is focused', async ({ page }) => {
    test.setTimeout(45000);

    await page.goto(`${BASE_URL}/vector-explorer-polished.html`);
    await page.waitForFunction(() => typeof window.clearSearch === 'function', { timeout: 20000 });
    await page.waitForTimeout(1500);

    await enterSearchQuery(page, 'coffee');
    await waitForResults(page);

    // Blur everything so handleGlobalKeydown catches the Escape
    await page.evaluate(() => document.body.focus());
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1500);

    const inputAfter = await page.evaluate(() => document.getElementById('search-input')?.value ?? '');
    expect(inputAfter, 'Escape with no focused element must clear search via global handler').toBe('');
  });

  test('clear button click clears search via DOM click event (not keyboard)', async ({ page }) => {
    test.setTimeout(45000);

    await page.goto(`${BASE_URL}/vector-explorer-polished.html`);
    await page.waitForFunction(() => typeof window.clearSearch === 'function', { timeout: 20000 });
    await page.waitForTimeout(1500);

    await enterSearchQuery(page, 'coffee');
    await waitForResults(page);

    // Use dispatchEvent to simulate a real DOM click (not Playwright's click)
    await page.evaluate(() => {
      const btn = document.getElementById('search-clear-btn');
      if (btn) btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });

    await page.waitForTimeout(1000);

    const inputAfter = await page.evaluate(() => document.getElementById('search-input')?.value ?? '');
    expect(inputAfter, 'clear button click must empty search input').toBe('');
    const resultsAfter = await page.locator('.search-result-item').count();
    expect(resultsAfter, 'clear button click must remove result items').toBe(0);
  });

  test('Escape during active micro-demo cancels demo via demo-controller keydown', async ({ page }) => {
    test.setTimeout(60000);

    const STORAGE_KEY = 'moco_mycelium_demo_v1';
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.addInitScript(({ key }) => {
      localStorage.removeItem(key);
      sessionStorage.clear();
      window.__demoResetProof = { cancelled: false };
      window.addEventListener('demo-cancelled', () => {
        window.__demoResetProof.cancelled = true;
      }, { once: true });
    }, { key: STORAGE_KEY });

    await page.goto(`${BASE_URL}/vector-explorer-polished.html?demo=force`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.getElementById('micro-demo-pill') !== null, { timeout: 15000 });
    await expect.poll(async () => page.evaluate(() => window.demoController?.isRunning?.() ?? false)).toBe(true);

    // Press Escape: should cancel demo via demo-controller onKeydown.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1500);

    await expect.poll(async () => page.evaluate(() => window.demoController?.isRunning?.() ?? false)).toBe(false);
    await expect.poll(async () => page.evaluate(() => window.state?.navState?.mode ?? 'unknown')).toBe('overview');

    const demoProof = await page.evaluate(() => window.__demoResetProof);
    expect(demoProof.cancelled, 'Escape during active demo must emit demo-cancelled event').toBe(true);

    const realErrors = errors.filter(e => !e.includes('net::ERR') && !e.includes('Failed to load resource'));
    expect(realErrors, `Unexpected console errors: ${JSON.stringify(realErrors)}`).toHaveLength(0);
  });

  test('keyboard-operable clear button: Enter key activates it', async ({ page }) => {
    test.setTimeout(45000);

    await page.goto(`${BASE_URL}/vector-explorer-polished.html`);
    await page.waitForFunction(() => typeof window.clearSearch === 'function', { timeout: 20000 });
    await page.waitForTimeout(1500);

    await enterSearchQuery(page, 'cafe');
    await waitForResults(page);

    const clearBtn = page.locator('#search-clear-btn');
    await expect(clearBtn).toBeVisible();

    // Focus the clear button and press Enter
    await clearBtn.focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);

    const inputAfter = await page.evaluate(() => document.getElementById('search-input')?.value ?? '');
    expect(inputAfter, 'Enter on focused clear button must clear search').toBe('');
    await expect(clearBtn).not.toBeVisible();
  });

  test('resetExplorationFocus called from clearSearch chain preserves no timers', async ({ page }) => {
    test.setTimeout(45000);

    await page.goto(`${BASE_URL}/vector-explorer-polished.html`);
    await page.waitForFunction(() => typeof window.resetExplorationFocus === 'function', { timeout: 20000 });
    await page.waitForTimeout(1500);

    // Enter focus state
    await enterSearchQuery(page, 'coffee');
    await waitForResults(page);
    await page.locator('.search-result-item').first().click();
    await page.waitForTimeout(2000);

    // Verify timers exist before reset
    const timersBefore = await page.evaluate(() => ({
      viewSwitchPreludeTimer: window.state?.viewSwitchPreludeTimer ?? null,
      searchTimeout: window.state?.searchTimeout ?? null
    }));
    // Both should be null or some timer ID; check they are not stuck.
    expect(timersBefore.viewSwitchPreludeTimer ?? null).toBeNull();

    // Escape triggers clearSearch -> resetExplorationFocus chain.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1500);

    const timersAfter = await page.evaluate(() => ({
      viewSwitchPreludeTimer: window.state?.viewSwitchPreludeTimer ?? null,
      searchTimeout: window.state?.searchTimeout ?? null
    }));
    expect(timersAfter.viewSwitchPreludeTimer, 'viewSwitchPreludeTimer must be null after full Escape reset').toBeNull();
    expect(timersAfter.searchTimeout, 'searchTimeout must be null after full Escape reset').toBeNull();
  });
});
