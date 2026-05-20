import { test, expect } from '@playwright/test';

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

async function openApp(page) {
  await setupMockSearch(page);
  await page.goto(`${BASE_URL}/vector-explorer-polished.html?view=galaxy`);
  await page.waitForFunction(() => (
    typeof window.setSemanticDiveMode === 'function' &&
    typeof window.refreshCompositionState === 'function' &&
    document.body.dataset.graphicsMode === 'webgl'
  ), { timeout: 20000 });
  await page.waitForTimeout(1200);
}

/**
 * stateProbe() — captures the three-way sync surface:
 *   URL search params  (parsed from location.href)
 *   body.dataset       (DOM reflection of UI state)
 *   window.state       (canonical JS state)
 */
async function stateProbe(page) {
  return page.evaluate(() => {
    const url = new URL(location.href);
    return {
      url: location.href,
      params: {
        view: url.searchParams.get('view'),
        q: url.searchParams.get('q'),
        record: url.searchParams.get('record'),
        anchor: url.searchParams.get('anchor'),
        depth: url.searchParams.get('depth'),
        mode: url.searchParams.get('mode')
      },
      body: {
        activeView: document.body.dataset.activeView || '',
        graphContext: document.body.dataset.graphContext || '',
        panelSurface: document.body.dataset.panelSurface || '',
        semanticDive: document.body.dataset.semanticDive || '',
        trailDepth: document.body.dataset.trailDepth || ''
      },
      state: {
        currentView: window.state?.currentView || '',
        trailDepth: window.state?.trailDepth ?? null,
        semanticDiveMode: window.state?.semanticDiveMode ?? null,
        selectedPoint: window.state?.selectedPoint ? String(window.state.selectedPoint.lead_id) : null,
        currentSearchSummary: window.state?.currentSearchSummary ? {
          query: window.state.currentSearchSummary.query,
          anchorIndex: window.state.currentSearchSummary.anchorIndex
        } : null
      }
    };
  });
}

test.describe('Live URL State Reconstruction', () => {
  /**
   * Q1/Q2/Q3: Load with a full-parameter URL and verify all three layers agree.
   *
   * Params: view=galaxy & q=coffee & record=1 & depth=2 & mode=trail
   *
   * Expected after init:
   *   - state.trailDepth  = 2  (depth=2 was written by updateUrlState on Step Inside)
   *   - state.semanticDiveMode = true  (derived from trailDepth === 2)
   *   - body.dataset.semanticDive = 'active'
   *   - body.dataset.trailDepth = '2'
   *   - URL depth param   = '2'  (should still be in URL after reconstruction)
   *
   * Gap this test exposes: depth=2 is NOT parsed by applyUrlState().
   * If the reconstruction path doesn't go through focusOnPoint → setSemanticDiveMode,
   * trailDepth stays 0 and body.dataset.semanticDive stays 'inactive' even though
   * the URL contains depth=2.
   */
  test('full-parameter URL reconstructs depth=2 dive mode correctly', async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openApp(page);

    // Simulate a pre-built shared link from a prior Step Inside session:
    // view=galaxy (default) + q=coffee + record=1 (lead_id of first search result)
    // + depth=2 + mode=trail — all params as they would exist after Step Inside
    const urlWithParams = `${BASE_URL}/vector-explorer-polished.html?view=galaxy&q=coffee&record=1&anchor=1&depth=2&mode=trail`;

    // Reload the page with those params — this is the shared-link restoration path
    await setupMockSearch(page);
    await page.goto(urlWithParams);
    await page.waitForFunction(() => (
      typeof window.applyUrlState === 'function' &&
      document.body.dataset.graphicsMode === 'webgl'
    ), { timeout: 20000 });
    await page.waitForTimeout(2000); // allow applyUrlState + search to complete

    const probe = await stateProbe(page);

    // Canonical state checks
    expect(probe.state.trailDepth).toBe(2);
    expect(probe.state.semanticDiveMode).toBe(true);

    // body.dataset checks
    expect(probe.body.trailDepth).toBe('2');
    expect(probe.body.semanticDive).toBe('active');

    // URL should still contain depth=2 after restoration
    expect(probe.params.depth).toBe('2');
    expect(probe.params.mode).toBe('trail');

    // graphContext should be 'focus' (has focus + search intent)
    expect(probe.body.graphContext).toBe('focus');

    // panelSurface should be 'semantic-dive' (dive mode active)
    expect(probe.body.panelSurface).toBe('semantic-dive');

    // Search summary should be restored
    expect(probe.state.currentSearchSummary?.query).toBe('coffee');
  });

  /**
   * Test the deferred restoration path: points array is empty when applyUrlState
   * first runs (data not yet loaded). The search query and record should be
   * re-applied once semantic-data-loaded fires.
   */
  test('deferred restoration: record focus retried after data loads', async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openApp(page);

    const urlWithParams = `${BASE_URL}/vector-explorer-polished.html?view=galaxy&q=coffee&record=1&anchor=1&depth=2&mode=trail`;
    await setupMockSearch(page);
    await page.goto(urlWithParams);

    // Block the data-loaded event by clearing points, then fire it manually
    await page.waitForFunction(() => typeof window.applyUrlState === 'function', { timeout: 20000 });
    await page.evaluate(() => {
      // Ensure state.points is empty so applyUrlState defers the record focus
      window.state.points = [];
      window.state._deferredUrlState = null;
    });

    // Now fire semantic-data-loaded — this triggers the retry path
    await page.evaluate(() => {
      document.dispatchEvent(new Event('semantic-data-loaded'));
    });

    await page.waitForTimeout(3000); // allow deferred retry to complete

    const probe = await stateProbe(page);

    // After data loads, the record focus should be applied
    // (state.points now has data from the mock search stub)
    expect(probe.state.selectedPoint).toBeTruthy();
    expect(probe.body.semanticDive).toBe('active');
  });

  /**
   * Test orphaned depth: navigate directly to a URL with depth=2 but NO record.
   * The URL has depth=2 but no anchor to trigger the focus chain.
   * Expected: depth param is ignored, trailDepth stays 0, semanticDive stays inactive.
   */
  test('depth=2 without record anchor is silently ignored', async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openApp(page);

    // depth=2 without a record param — no focus anchor exists
    const orphanedUrl = `${BASE_URL}/vector-explorer-polished.html?view=galaxy&depth=2&mode=trail`;
    await setupMockSearch(page);
    await page.goto(orphanedUrl);
    await page.waitForFunction(() => typeof window.applyUrlState === 'function', { timeout: 20000 });
    await page.waitForTimeout(2000);

    const probe = await stateProbe(page);

    // Without a record anchor, the focus chain never fires, so:
    // - trailDepth stays 0 (depth param is not parsed)
    // - semanticDiveMode stays false
    // This is the "orphaned depth" gap — URL says depth=2 but state says 0
    expect(probe.state.trailDepth).toBe(0);
    expect(probe.state.semanticDiveMode).toBe(false);
    expect(probe.body.semanticDive).toBe('inactive');
    // The URL still shows depth=2 — it's an independent truth, not a mirror
    expect(probe.params.depth).toBe('2');
  });

  /**
   * Q4: Smallest reliable test — back/forward with a search+focus URL.
   * Navigate to a search URL, then use browser back/forward and verify state is restored.
   */
  test('back/forward restores search+focus state after interactive navigation', async ({ page }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width: 1440, height: 1000 });

    // Step 1: Open app in galaxy view
    await openApp(page);

    // Step 2: Do a search — this writes q and anchor to URL
    const input = page.locator('#search-input');
    await input.focus();
    await input.fill('coffee');
    await page.evaluate(() => {
      const el = document.getElementById('search-input');
      el.value = 'coffee';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    try {
      await page.waitForSelector('.search-result-item', { state: 'visible', timeout: 8000 });
    } catch {
      await page.evaluate(() => { if (typeof window.search === 'function') window.search('coffee'); });
      await page.waitForSelector('.search-result-item', { state: 'visible', timeout: 15000 });
    }
    await page.locator('.search-result-item').first().click();
    await page.waitForFunction(() => Number.isFinite(window.state?.focusedNode), { timeout: 15000 });
    await page.waitForTimeout(900);

    // Capture the URL after search+focus
    const urlAfterFocus = page.url();
    const paramsAfterFocus = new URL(urlAfterFocus).searchParams;
    expect(paramsAfterFocus.get('q')).toBe('coffee');
    expect(paramsAfterFocus.get('anchor')).toBeTruthy();

    // Step 3: Navigate away (simple back to about:blank equivalent)
    await page.goto(`${BASE_URL}/vector-explorer-polished.html?view=galaxy`);
    await page.waitForTimeout(1500);

    // Step 4: Navigate back via browser back
    await page.goBack();
    await page.waitForFunction(() => (
      typeof window.applyUrlState === 'function' &&
      document.body.dataset.graphicsMode === 'webgl'
    ), { timeout: 20000 });
    await page.waitForTimeout(3000); // allow full restoration

    const probe = await stateProbe(page);

    // After back-nav, search summary should be restored
    expect(probe.state.currentSearchSummary?.query).toBe('coffee');
    // And URL params should still be present
    expect(probe.params.q).toBe('coffee');
    expect(probe.params.anchor).toBeTruthy();

    // currentView should be galaxy (not map)
    expect(probe.state.currentView).toBe('galaxy');
    expect(probe.body.activeView).toBe('galaxy');
  });
});