/**
 * canvas-hit-test-interaction.spec.js
 *
 * Regression coverage for canvas pointer interception: proves the WebGL canvas
 * does not block UI controls from receiving real click events.
 *
 * Detection approach: real Playwright clicks (not synthetic dispatch) on UI
 * targets that must succeed or definitively prove the canvas absorbed the event.
 *
 * Scopes tested (hit-testing):
 *   1. search-input click → receives focus
 *   2. search-clear-btn click → fires and clears input
 *   3. btn-focus-dive (Step Inside) click → activates semantic dive
 *   4. Escape key after Step Inside → returns to overview
 *
 * This is NOT a visual snapshot test. It uses behavioral assertions that fail
 * specifically and cleanly when canvas pointer-events are misconfigured.
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:8795';

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
    typeof window.clearSearch === 'function' &&
    typeof window.setSemanticDiveMode === 'function' &&
    typeof window.refreshCompositionState === 'function' &&
    Array.isArray(window.__TEST_STATE__?.points) &&
    window.__TEST_STATE__.points.length > 0 &&
    window.__TEST_STATE__.pointIndexByLeadId?.size > 0
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

async function performSearch(page, query = 'coffee') {
  const input = page.locator('#search-input');
  await input.focus();
  await input.fill(query);
  await page.evaluate(async (q) => {
    const el = document.getElementById('search-input');
    if (!el) return;
    el.value = q;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    if (typeof window.search === 'function') {
      await window.search(q, { preferCachedResults: false });
    }
  }, query);
  await expect(page.locator('.search-result-item').first()).toBeVisible({ timeout: 15000 });
}

async function enterFocusFromSearch(page) {
  await performSearch(page);
  await page.locator('.search-result-item').first().click();
  await page.waitForFunction(() => window.__TEST_STATE__?.navState?.mode === 'focus', { timeout: 15000 });
  await expect(page.locator('#btn-focus-dive')).toBeVisible({ timeout: 10000 });
}

async function stepInside(page) {
  await page.locator('#btn-focus-dive').click();
  await page.waitForFunction(() => (
    window.__TEST_STATE__?.trailDepth === 2 &&
    window.__TEST_STATE__?.semanticDiveMode === true &&
    document.body.dataset.semanticDive === 'active' &&
    document.body.dataset.panelSurface === 'semantic-dive'
  ), { timeout: 15000 });
}

async function probe(page) {
  return page.evaluate(() => ({
    inputValue: document.getElementById('search-input')?.value ?? '',
    resultCount: document.querySelectorAll('.search-result-item').length,
    focused: document.activeElement?.id ?? null,
    url: location.href,
    body: {
      panelSurface: document.body.dataset.panelSurface || '',
      semanticDive: document.body.dataset.semanticDive || '',
      trailDepth: document.body.dataset.trailDepth || ''
    },
    state: {
      focusedNode: window.__TEST_STATE__?.focusedNode ?? null,
      trailDepth: window.__TEST_STATE__?.trailDepth ?? null,
      semanticDiveMode: window.__TEST_STATE__?.semanticDiveMode ?? null,
      navMode: window.__TEST_STATE__?.navState?.mode || ''
    }
  }));
}

// ---------------------------------------------------------------------------
// Canvas hit-test suite
// ---------------------------------------------------------------------------

test.describe('canvas hit-test: proving canvas does not intercept UI clicks', () => {

  test('desktop: search-input click is received (not intercepted by canvas)', async ({ page }) => {
    test.setTimeout(60000);
    await openApp(page, { width: 1440, height: 900 });

    const input = page.locator('#search-input');
    await input.click({ force: false });

    const state = await probe(page);
    expect(state.focused, 'search-input should have focus after click').toBe('search-input');
  });

  test('desktop: search-clear-btn click fires and clears input (canvas not blocking)', async ({ page }) => {
    test.setTimeout(60000);
    await openApp(page, { width: 1440, height: 900 });
    await performSearch(page);

    const clearBtn = page.locator('#search-clear-btn');
    await expect(clearBtn).toBeVisible({ timeout: 5000 });
    await clearBtn.click({ force: false });

    const state = await probe(page);
    expect(state.inputValue, 'clear button should empty input').toBe('');
    expect(state.resultCount, 'clear button should remove result items').toBe(0);
  });

  test('desktop: btn-focus-dive click activates semantic dive (canvas not absorbing click)', async ({ page }) => {
    test.setTimeout(60000);
    await openApp(page, { width: 1440, height: 900 });
    await enterFocusFromSearch(page);

    const diveBtn = page.locator('#btn-focus-dive');
    await diveBtn.click({ force: false });

    const state = await probe(page);
    expect(state.state.semanticDiveMode, 'Step Inside should activate semanticDiveMode').toBe(true);
    expect(state.state.trailDepth, 'Step Inside should set trailDepth to 2').toBe(2);
    // semanticDive dataset may be "transitioning" or "active" — both prove the click was not absorbed by canvas
    expect(['active', 'transitioning']).toContain(state.body.semanticDive);
    expect(state.body.panelSurface, 'body dataset panelSurface should be "semantic-dive"').toBe('semantic-dive');
  });

  test('mobile: search-input click receives focus (canvas pointer-events:none verified)', async ({ page }) => {
    test.setTimeout(60000);
    await openApp(page, { width: 390, height: 844 });

    const input = page.locator('#search-input');
    await input.click({ force: false });

    const state = await probe(page);
    expect(state.focused, 'search-input should have focus after click on mobile').toBe('search-input');
  });

  test('mobile: clear-search click fires (canvas does not block mobile controls)', async ({ page }) => {
    test.setTimeout(60000);
    await openApp(page, { width: 390, height: 844 });
    await performSearch(page);

    const clearBtn = page.locator('#search-clear-btn');
    await expect(clearBtn).toBeVisible({ timeout: 5000 });
    await clearBtn.click({ force: false });

    const state = await probe(page);
    expect(state.inputValue, 'clear button should empty input on mobile').toBe('');
  });

  test('mobile: Step Inside click activates dive (canvas not intercepting mobile hit-test)', async ({ page }) => {
    test.setTimeout(60000);
    await openApp(page, { width: 390, height: 844 });
    await enterFocusFromSearch(page);

    const diveBtn = page.locator('#btn-focus-dive');
    await diveBtn.click({ force: false });

    const state = await probe(page);
    expect(state.state.semanticDiveMode, 'Step Inside should activate semanticDiveMode on mobile').toBe(true);
    expect(state.state.trailDepth, 'trailDepth should be 2 after Step Inside on mobile').toBe(2);
    expect(['active', 'transitioning']).toContain(state.body.semanticDive);
  });

  test('desktop: Escape after Step Inside resets state (keyboard path preserved, not canvas-blocked)', async ({ page }) => {
    test.setTimeout(60000);
    await openApp(page, { width: 1440, height: 900 });
    await enterFocusFromSearch(page);
    await stepInside(page);

    await page.evaluate(() => document.body.focus());
    await page.keyboard.press('Escape');
    await page.waitForTimeout(800);

    const state = await probe(page);
    expect(state.state.navMode, 'Escape should return navMode to overview').toBe('overview');
    expect(state.state.semanticDiveMode, 'Escape should clear semanticDiveMode').toBeFalsy();
    expect(state.state.trailDepth, 'Escape should reset trailDepth to 0').toBe(0);
    expect(state.body.semanticDive, 'body dataset semanticDive should be "inactive" after Escape').toBe('inactive');
  });

  test('mobile: Escape after Step Inside resets state (mobile keyboard path not canvas-blocked)', async ({ page }) => {
    test.setTimeout(60000);
    await openApp(page, { width: 390, height: 844 });
    await enterFocusFromSearch(page);
    await stepInside(page);

    await page.evaluate(() => document.body.focus());
    await page.keyboard.press('Escape');
    await page.waitForTimeout(800);

    const state = await probe(page);
    expect(state.state.navMode, 'Escape should return navMode to overview on mobile').toBe('overview');
    expect(state.state.semanticDiveMode, 'Escape should clear semanticDiveMode on mobile').toBeFalsy();
    expect(state.body.panelSurface, 'panelSurface should return to idle after mobile Escape').toBe('idle');
  });

  test('tablet: search-input and clear button both receive real clicks (canvas not blocking 768px)', async ({ page }) => {
    test.setTimeout(60000);
    await openApp(page, { width: 768, height: 1024 });
    await performSearch(page);

    const input = page.locator('#search-input');
    await input.click({ force: false });
    const focused = await probe(page);
    expect(focused.focused, 'search-input should have focus at tablet width').toBe('search-input');

    const clearBtn = page.locator('#search-clear-btn');
    await clearBtn.click({ force: false });
    const afterClear = await probe(page);
    expect(afterClear.inputValue, 'clear button should empty input at tablet width').toBe('');
    expect(afterClear.resultCount, 'clear button should remove results at tablet width').toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Short-landscape regression coverage (~844x390)
  // ---------------------------------------------------------------------------

  test('short-landscape: search-input click is received at 844x390', async ({ page }) => {
    test.setTimeout(60000);
    await openApp(page, { width: 844, height: 390 });

    const input = page.locator('#search-input');
    await expect(input).toBeVisible({ timeout: 5000 });

    const hitTarget = await page.evaluate(() => {
      const input = document.getElementById('search-input');
      if (!input) return 'input-not-found';
      const rect = input.getBoundingClientRect();
      const el = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return el ? (el.id || el.className || el.tagName) : 'no-element';
    });

    expect(hitTarget, `search-input center should not be covered at 844x390; hit ${hitTarget}`).toBe('search-input');
    await input.click({ force: false });

    const state = await probe(page);
    expect(state.focused, 'search-input should receive real click focus at short-landscape').toBe('search-input');
  });

  test('short-landscape: search-clear-btn receives a real click at 844x390', async ({ page }) => {
    test.setTimeout(60000);
    await openApp(page, { width: 844, height: 390 });
    await performSearch(page);

    const clearBtn = page.locator('#search-clear-btn');
    await expect(clearBtn).toBeVisible({ timeout: 5000 });
    await clearBtn.click({ force: false });

    const state = await probe(page);
    expect(state.inputValue, 'clear button should empty input at short-landscape').toBe('');
    expect(state.resultCount, 'clear button should remove results at short-landscape').toBe(0);
  });

  test('short-landscape: btn-focus-dive click activates semantic dive at 844x390', async ({ page }) => {
    test.setTimeout(60000);
    await openApp(page, { width: 844, height: 390 });
    await enterFocusFromSearch(page);

    const diveBtn = page.locator('#btn-focus-dive');
    await diveBtn.click({ force: false });

    const state = await probe(page);
    expect(state.state.semanticDiveMode, 'Step Inside should activate semanticDiveMode at short-landscape').toBe(true);
    expect(state.state.trailDepth, 'trailDepth should be 2 after Step Inside at short-landscape').toBe(2);
    expect(['active', 'transitioning']).toContain(state.body.semanticDive);
  });

  test('short-landscape: Escape after real-click Step Inside resets state', async ({ page }) => {
    test.setTimeout(60000);
    await openApp(page, { width: 844, height: 390 });
    await enterFocusFromSearch(page);

    await page.locator('#btn-focus-dive').click({ force: false });
    await page.waitForFunction(() => (
      window.__TEST_STATE__?.semanticDiveMode === true ||
      document.body.dataset.semanticDive === 'active'
    ), { timeout: 15000 });

    await page.evaluate(() => document.body.focus());
    await page.keyboard.press('Escape');
    await page.waitForTimeout(800);

    const state = await probe(page);
    expect(state.state.navMode, 'Escape should return navMode to overview at short-landscape').toBe('overview');
    expect(state.state.semanticDiveMode, 'semanticDiveMode should be cleared after Escape').toBeFalsy();
    expect(state.body.semanticDive, 'semanticDive dataset should be inactive after Escape').toBe('inactive');
    expect(state.state.trailDepth, 'Escape should reset trailDepth to 0 at short-landscape').toBe(0);
  });

});
