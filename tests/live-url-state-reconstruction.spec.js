import { test, expect } from '@playwright/test';
import { setupMockSearch } from './helpers/mock-semantic-search.js';

const BASE_URL = (process.env.TEST_BASE_URL || 'http://127.0.0.1:8795').replace(/\/$/, '');

async function openApp(page) {
  await setupMockSearch(page);
  await page.goto(`${BASE_URL}/vector-explorer-polished.html?view=galaxy`);
  await page.waitForFunction(() => (
    document.body.dataset.graphicsMode === 'webgl' &&
    Array.isArray(window.__TEST_STATE__?.points) &&
    window.__TEST_STATE__.points.length > 0
  ), { timeout: 20000 });
  await page.waitForTimeout(1200);
}

/**
 * stateProbe() — captures the three-way sync surface:
 *   URL search params  (parsed from location.href)
 *   body.dataset       (DOM reflection of UI state)
 *   window.__TEST_STATE__       (canonical JS state)
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
        currentView: window.__TEST_STATE__?.currentView || '',
        trailDepth: window.__TEST_STATE__?.trailDepth ?? null,
        semanticDiveMode: window.__TEST_STATE__?.semanticDiveMode ?? null,
        selectedPoint: window.__TEST_STATE__?.selectedPoint ? String(window.__TEST_STATE__.selectedPoint.lead_id) : null,
        currentSearchSummary: window.__TEST_STATE__?.currentSearchSummary ? {
          query: window.__TEST_STATE__.currentSearchSummary.query,
          anchorIndex: window.__TEST_STATE__.currentSearchSummary.anchorIndex
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
      document.body.dataset.graphicsMode === 'webgl'
    ), { timeout: 20000 });
    await page.waitForFunction(() => (
      window.__TEST_STATE__?.trailDepth === 2 &&
      window.__TEST_STATE__?.semanticDiveMode === true &&
      document.body.dataset.semanticDive === 'active'
    ), { timeout: 15000 });

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
   * Restoration waits through the async search/focus path instead of sampling
   * while the page is still loading. The URL should land on the focused record
   * and activate depth=2 through the lifecycle API.
   */
  test('record focus restoration completes after async search/data load', async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openApp(page);

    const urlWithParams = `${BASE_URL}/vector-explorer-polished.html?view=galaxy&q=coffee&record=1&anchor=1&depth=2&mode=trail`;
    await setupMockSearch(page);
    await page.goto(urlWithParams);

    await page.waitForFunction(() => (
      window.__TEST_STATE__?.selectedPoint &&
      window.__TEST_STATE__?.trailDepth === 2 &&
      window.__TEST_STATE__?.semanticDiveMode === true &&
      document.body.dataset.semanticDive === 'active'
    ), { timeout: 20000 });

    const probe = await stateProbe(page);

    expect(probe.state.selectedPoint).toBeTruthy();
    expect(probe.body.semanticDive).toBe('active');
  });

  /**
   * Test orphaned depth: navigate directly to a URL with depth=2 but NO record.
   * mode=trail may restore the visible trail shell at depth=1, but depth=2
   * must not activate without a focused record/anchor.
   */
  test('depth=2 without record anchor is silently ignored', async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openApp(page);

    // depth=2 without a record param — no focus anchor exists
    const orphanedUrl = `${BASE_URL}/vector-explorer-polished.html?view=galaxy&depth=2&mode=trail`;
    await setupMockSearch(page);
    await page.goto(orphanedUrl);
    await page.waitForFunction(() => document.body.dataset.graphicsMode === 'webgl', { timeout: 20000 });
    await page.waitForTimeout(2000);

    const probe = await stateProbe(page);

    // Without a record anchor, the dive focus chain never fires, so:
    // - trailDepth may restore to 1 from mode=trail
    // - semanticDiveMode stays false
    // - depth=2 is ignored because there is no focused record to dive into
    expect(probe.state.trailDepth).toBe(1);
    expect(probe.state.semanticDiveMode).toBe(false);
    expect(probe.body.semanticDive).toBe('inactive');
    // URL state is canonicalized back to depth=1 because no record focus exists.
    expect(probe.params.depth).toBe('1');
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
    await page.waitForFunction(() => Number.isFinite(window.__TEST_STATE__?.focusedNode), { timeout: 15000 });
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
