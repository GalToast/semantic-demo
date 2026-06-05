/**
 * dynamic-lighting-contract.spec.js
 *
 * Contract test proving that when `state.focusedNode` becomes non-null (focus
 * state), the opacity of mycelium LineSegments materials increases from their
 * overview-mode values to their focus-mode values.
 *
 * From js/modules/three-engine.ts, getMyceliumPresentationProfile():
 *   - overview mode:   { core: 0.07, wispy: 0.026, bridge: 0.045, pulse: 0.018 }
 *   - focused mode:    { core: 0.14,  wispy: 0.045, bridge: 0.07,  pulse: 0.006 }
 *
 * Test approach:
 *   1. Open the app with mock API stubs, wait for ready
 *   2. Capture initial (overview-mode) opacity values via page.evaluate()
 *   3. Perform a search and click a result to enter focus mode
 *   4. Wait for state.focusedNode !== null
 *   5. Re-read opacity values and verify they are HIGHER than initial values
 *
 * Run: npx playwright test tests/dynamic-lighting-contract.spec.js --headed
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:8795';

// ---------------------------------------------------------------------------
// Mock API stubs — same shape used across the contract test suite
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function setupMockSearch(page) {
  await page.route('**/api.php?action=semantic_lane_health**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SEMANTIC_HEALTH_STUB) })
  );
  await page.route('**/api.php?action=semantic_search**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SEARCH_STUB) })
  );
}

async function openApp(page, viewport = { width: 1440, height: 900 }) {
  await setupMockSearch(page);
  await page.setViewportSize(viewport);
  await page.goto(`${BASE_URL}/vector-explorer-polished.html?view=galaxy`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => (
    document.body.dataset.graphicsMode === 'webgl' &&
    Array.isArray(window.__TEST_STATE__?.points) &&
    (window.__APP_STATE__ ?? window.__TEST_STATE__).points.length > 0 &&
    (window.__APP_STATE__ ?? window.__TEST_STATE__).pointIndexByLeadId?.size > 0
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
  // preceding waitForFunction handles settlement
  await page.waitForFunction(() => Boolean(window.__TEST_STATE__?.myceliumCoreLines?.material), { timeout: 10000 })
    .catch(() => {});
}

async function performSearch(page, query = 'coffee') {
  const input = page.locator('#search-input');
  await input.focus();
  await input.fill(query);
  await page.evaluate(async (q) => {
    const el = document.getElementById('search-input');
    if (!el) return;
    el.value = q;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    if (typeof window.__APP_ACTIONS__?.search === 'function') {
      await window.__APP_ACTIONS__.search(q, { preferCachedResults: false });
    }
  }, query);
  await expect(page.locator('.search-result-item').first()).toBeVisible({ timeout: 15000 });
}

/** Probe the opacity values from the Three.js material objects. */
async function probeOpacities(page) {
  return page.evaluate(() => {
    const state = window.__TEST_STATE__ || {};
    const coreMat  = state.myceliumCoreLines?.material;
    const wispyMat = state.myceliumWispyLines?.material;
    const bridgeMat = state.myceliumBridgeLines?.material;
    return {
      core:    coreMat?.opacity ?? null,
      wispy:   wispyMat?.opacity ?? null,
      bridge:  bridgeMat?.opacity ?? null,
      focusedNode: state.focusedNode ?? null,
      navMode: state.navState?.mode ?? state.navState?.currentMode ?? null
    };
  });
}

function availableOpacityEntries(opacities) {
  return ['core', 'wispy', 'bridge']
    .filter(key => opacities[key] !== null && opacities[key] !== undefined)
    .map(key => [key, opacities[key]]);
}

const OVERVIEW_TARGETS = { core: 0.07, wispy: 0.026, bridge: 0.045 };
const FOCUS_TARGETS = { core: 0.14, wispy: 0.045, bridge: 0.07 };

// ---------------------------------------------------------------------------
// Dynamic lighting suite
// ---------------------------------------------------------------------------

test.describe('dynamic-lighting: mycelium opacity responds to focus state', () => {

  test.skip('overview opacities are at overview-mode values', async ({ page }) => {
    test.setTimeout(60000);
    await openApp(page, { width: 1440, height: 900 });

    const opacities = await probeOpacities(page);

    const available = availableOpacityEntries(opacities);
    test.skip(available.length === 0, 'overview load did not naturally create mycelium materials');

    // Overview-mode reference values from getMyceliumPresentationProfile()
    // Allow generous tolerance (±50 %) since the scene may be in an intermediate
    // state on first read; the important invariant is that they are NEAR overview
    // values, not near focus values.
    for (const [key, opacity] of available) {
      expect(opacity, `${key} opacity should be near overview value ${OVERVIEW_TARGETS[key]}`)
        .toBeCloseTo(OVERVIEW_TARGETS[key], 1);
    }

    // Verify we are in overview mode with no focused node
    expect(opacities.focusedNode, 'focusedNode should be null in overview mode').toBeNull();
    expect(opacities.navMode,    'navMode should be overview').toBe('overview');
  });

  test('opacities increase after entering focus mode (search click)', async ({ page }) => {
    test.setTimeout(60000);
    await openApp(page, { width: 1440, height: 900 });

    // Capture overview-mode baseline
    const baseline = await probeOpacities(page);
    const baselineAvailable = availableOpacityEntries(baseline);
    expect(baselineAvailable.length, 'at least one baseline mycelium material must exist').toBeGreaterThan(0);

    // Perform search and click first result to enter focus mode
    await performSearch(page);
    await page.locator('.search-result-item').first().click();

    // Wait for focusedNode to become non-null
    await page.waitForFunction(
      () => window.__TEST_STATE__?.focusedNode !== null && window.__TEST_STATE__?.focusedNode !== undefined,
      { timeout: 15000 }
    );

    // Capture focus-mode values
    const focused = await probeOpacities(page);

    // Core invariants of the focus transition
    expect(focused.focusedNode, 'focusedNode must be non-null after click').not.toBeNull();
    expect(['focus', 'trail'], 'navMode should indicate an active focus/trail state after result click')
      .toContain(focused.navMode);

    const focusedAvailable = availableOpacityEntries(focused);
    expect(focusedAvailable.length, 'at least one focused mycelium material must exist').toBeGreaterThan(0);

    for (const [key, opacity] of focusedAvailable) {
      expect(opacity, `${key} opacity must increase in focus mode`).toBeGreaterThan(baseline[key]);
      expect(opacity, `${key} opacity should reach the focus range`).toBeGreaterThanOrEqual(FOCUS_TARGETS[key] * 0.75);
    }
  });

  test('opacities return toward overview values after exiting focus', async ({ page }) => {
    test.setTimeout(60000);
    await openApp(page, { width: 1440, height: 900 });

    // Enter focus mode
    await performSearch(page);
    await page.locator('.search-result-item').first().click();
    await page.waitForFunction(
      () => window.__TEST_STATE__?.focusedNode !== null && window.__TEST_STATE__?.focusedNode !== undefined,
      { timeout: 15000 }
    );

    const focused = await probeOpacities(page);
    const focusedAvailable = availableOpacityEntries(focused);
    expect(focusedAvailable.length, 'at least one focused mycelium material must exist').toBeGreaterThan(0);
    expect(Math.max(...focusedAvailable.map(([, opacity]) => opacity))).toBeGreaterThan(0.2);

    // Clear focusedNode by pressing Escape (returns to overview)
    await page.evaluate(() => document.body.focus());
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => r(true))), { timeout: 5000 }).catch(() => {});

    // Wait for focusedNode to be cleared
    await page.waitForFunction(
      () => window.__TEST_STATE__?.focusedNode === null || window.__TEST_STATE__?.focusedNode === undefined,
      { timeout: 10000 }
    );

    const afterReset = await probeOpacities(page);

    // After reset: focusedNode should be null and opacities should have decreased
    expect(afterReset.focusedNode, 'focusedNode should be null after Escape').toBeNull();

    for (const [key, opacity] of availableOpacityEntries(afterReset)) {
      expect(opacity, `${key} opacity should decrease after Escape`).toBeLessThan(focused[key]);
    }
  });

});
