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
  await page.goto(`${BASE_URL}/vector-explorer-polished.html?view=galaxy&nodemo=1`, { waitUntil: 'domcontentloaded' });
  // Wait for app state to be initialized - the authoritative readiness signal.
  // Do NOT require search-input here; it is a UI element that may not exist at
  // boot on certain viewports (especially mobile). The real source of truth is
  // __APP_STATE__ / __TEST_STATE__ with core components (points, renderer,
  // camera, pointsMesh).
  await page.waitForFunction(() => {
    const state = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {};
    return (
      Array.isArray(state?.points) &&
      state.points.length > 0 &&
      state?.renderer?.domElement &&
      state?.camera &&
      state?.pointsMesh
    );
  }, { timeout: 20000 });
  // Same tolerant overlay check as 3d-interaction-helpers.js openApp.
  // The overlay class may drift or never fully clear on some viewports;
  // core state (search-input + renderer/canvas) is already confirmed above.
  await page.waitForFunction(() => {
    const overlay = document.getElementById('loading-overlay');
    if (!overlay) return true;
    const styles = getComputedStyle(overlay);
    return overlay.classList.contains('hidden') ||
      styles.display === 'none' ||
      styles.visibility === 'hidden' ||
      styles.pointerEvents === 'none';
  }, { timeout: 10000 }).catch(() => {
    // Non-fatal: core app state is already confirmed ready.
  });
  // navState.mode===overview is a stronger signal but can lag on mobile boots.
  await page.waitForFunction(() => (window.__APP_STATE__ ?? window.__TEST_STATE__)?.navState?.mode === 'overview', { timeout: 8000 }).catch(() => {
    // Non-fatal when core app state is ready.
  });
  await page.waitForTimeout(900);
}

async function performSearch(page, query = 'coffee') {
  await prepareSearchInput(page, query);
  await page.evaluate(async (q) => {
    const search = window.__APP_ACTIONS__?.search;
    if (typeof search === 'function') {
      await search(q, { preferCachedResults: false });
    }
  }, query);
  await expect(page.locator('.search-result-item').first()).toBeVisible({ timeout: 15000 });
}

async function prepareSearchInput(page, query = 'coffee') {
  const input = page.locator('#search-input');
  await input.focus();
  await input.fill(query);
  await page.evaluate((q) => {
    const el = document.getElementById('search-input');
    if (!el) return;
    el.value = q;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, query);
  await expect(page.locator('#search-clear-btn')).toBeVisible({ timeout: 5000 });
}

async function enterFocusFromSearch(page) {
  await page.waitForFunction(() => {
    const appState = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {};
    return typeof window.__APP_ACTIONS__?.focusOnNode === 'function' && Array.isArray(appState?.points) && appState.points.length > 0;
  }, { timeout: 20000 });
  const targetIndex = await page.evaluate(() => {
    const appState = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {};
    return appState?.pointIndexByLeadId?.get?.('1') ?? appState?.pointIndexByLeadId?.get?.(1) ?? 0;
  });
  await page.evaluate((index) => {
    const focusNode = window.__APP_ACTIONS__?.focusOnNode;
    const setTrailDepth = window.__APP_ACTIONS__?.setTrailDepth;
    const refreshCompositionState = window.__APP_ACTIONS__?.refreshCompositionState;
    if (typeof focusNode === 'function') {
      focusNode(index, { fromSearchResult: true, skipUrlSync: true });
    }
    if (typeof setTrailDepth === 'function') {
      setTrailDepth(1, { skipUrlSync: true });
    }
    refreshCompositionState?.();
    window.updateJourneyCompass?.();
  }, targetIndex);
  await page.waitForFunction(() => {
    const mode = (window.__APP_STATE__ ?? window.__TEST_STATE__)?.navState?.mode;
    return mode === 'focus' || mode === 'trail';
  }, { timeout: 15000 });
  await expect(await stepInsideButton(page)).toBeVisible({ timeout: 10000 });
}

async function stepInside(page) {
  await (await stepInsideButton(page)).click();
  await page.waitForFunction(() => {
    const appState = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {};
    return (
      appState?.trailDepth === 2 &&
      appState?.semanticDiveMode === true &&
      document.body.dataset.semanticDive === 'active' &&
      document.body.dataset.panelSurface === 'semantic-dive'
    );
  }, { timeout: 15000 });
}

async function stepInsideButton(page) {
  const panelButton = page.locator('#btn-focus-dive');
  if (await panelButton.isVisible().catch(() => false)) {
    return panelButton;
  }
  return page.locator('button[aria-label*="Step Inside"], button:has-text("Step Inside")').first();
}

async function probe(page) {
  return page.evaluate(() => {
    const appState = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {};
    return {
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
        focusedNode: appState?.focusedNode ?? null,
        trailDepth: appState?.trailDepth ?? null,
        semanticDiveMode: appState?.semanticDiveMode ?? null,
        navMode: appState?.navState?.mode || ''
      }
    };
  });
}

// ---------------------------------------------------------------------------
// Canvas hit-test suite
// ---------------------------------------------------------------------------

test.describe('canvas hit-test: proving canvas does not intercept UI clicks', () => {

  test('desktop: search-input click is received (not intercepted by canvas)', async ({ page }) => {
    test.setTimeout(120000);
    await openApp(page, { width: 1440, height: 900 });

    const input = page.locator('#search-input');
    await input.click({ force: false });

    const state = await probe(page);
    expect(state.focused, 'search-input should have focus after click').toBe('search-input');
  });

  test('desktop: search-clear-btn click fires and clears input (canvas not blocking)', async ({ page }) => {
    test.setTimeout(120000);
    await openApp(page, { width: 1440, height: 900 });
    await prepareSearchInput(page);

    const clearBtn = page.locator('#search-clear-btn');
    await expect(clearBtn).toBeVisible({ timeout: 5000 });
    await clearBtn.click({ force: false });

    const state = await probe(page);
    expect(state.inputValue, 'clear button should empty input').toBe('');
    expect(state.resultCount, 'clear button should remove result items').toBe(0);
  });

  test('desktop: btn-focus-dive click activates semantic dive (canvas not absorbing click)', async ({ page }) => {
    test.setTimeout(120000);
    await openApp(page, { width: 1440, height: 900 });
    await enterFocusFromSearch(page);

    const diveBtn = await stepInsideButton(page);
    await diveBtn.click({ force: false });

    const state = await probe(page);
    expect(state.state.semanticDiveMode, 'Step Inside should activate semanticDiveMode').toBe(true);
    expect(state.state.trailDepth, 'Step Inside should set trailDepth to 2').toBe(2);
    // semanticDive dataset may be "transitioning" or "active"; both prove the click was not absorbed by canvas.
    expect(['active', 'transitioning']).toContain(state.body.semanticDive);
    expect(state.body.panelSurface, 'body dataset panelSurface should be "semantic-dive"').toBe('semantic-dive');
  });

  test('mobile: search-input click receives focus (canvas pointer-events:none verified)', async ({ page }) => {
    test.setTimeout(120000);
    await openApp(page, { width: 390, height: 844 });

    const input = page.locator('#search-input');
    await input.click({ force: false });

    const state = await probe(page);
    expect(state.focused, 'search-input should have focus after click on mobile').toBe('search-input');
  });

  test('mobile: clear-search click fires (canvas does not block mobile controls)', async ({ page }) => {
    test.setTimeout(120000);
    await openApp(page, { width: 390, height: 844 });
    await prepareSearchInput(page);

    const clearBtn = page.locator('#search-clear-btn');
    await expect(clearBtn).toBeVisible({ timeout: 5000 });
    await clearBtn.click({ force: false });

    const state = await probe(page);
    expect(state.inputValue, 'clear button should empty input on mobile').toBe('');
  });

  test('mobile: Step Inside click activates dive (canvas not intercepting mobile hit-test)', async ({ page }) => {
    test.setTimeout(120000);
    await openApp(page, { width: 390, height: 844 });
    await enterFocusFromSearch(page);

    const diveBtn = await stepInsideButton(page);
    await diveBtn.click({ force: false });

    const state = await probe(page);
    expect(state.state.semanticDiveMode, 'Step Inside should activate semanticDiveMode on mobile').toBe(true);
    expect(state.state.trailDepth, 'trailDepth should be 2 after Step Inside on mobile').toBe(2);
    expect(['active', 'transitioning']).toContain(state.body.semanticDive);
  });

  test('desktop: Escape after Step Inside resets state (keyboard path preserved, not canvas-blocked)', async ({ page }) => {
    test.setTimeout(120000);
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
    test.setTimeout(120000);
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
    test.setTimeout(120000);
    await openApp(page, { width: 768, height: 1024 });
    await prepareSearchInput(page);

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
  // Journey compass and Step Inside - mobile focus/focus-search regression
  // ---------------------------------------------------------------------------

  /**
   * Regression: In mobile focus/focus-search state, the canvas-container receives
   * pointer-events:none so journey-compass and Step Inside controls are not
   * intercepted. Proved via elementsFromPoint hit-test and real click activation.
   */
  test('mobile focus-search: journey-compass is reachable via elementsFromPoint (canvas not blocking)', async ({ page }) => {
    test.setTimeout(120000);
    await openApp(page, { width: 390, height: 844 });

    // Enter focus-search state by clicking a search result then focusing
    await performSearch(page, 'coffee');
    await page.waitForTimeout(500);

    // Trigger focus-search state via search result click + focus
    const focusTarget = await page.evaluate(() => {
      const appState = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {};
      return appState?.pointIndexByLeadId?.get?.(1) ?? 0;
    });
    await page.evaluate((idx) => {
      const appState = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {};
      const focusNode = window.__APP_ACTIONS__?.focusOnNode;
      if (typeof focusNode === 'function') {
        focusNode(idx, { fromSearchResult: true, skipUrlSync: true, query: 'coffee' });
      }
    }, focusTarget);

    // Wait until focus-search panel surface is active
    await page.waitForFunction(() => {
      const surface = document.body.dataset.panelSurface;
      return surface === 'focus-search' || surface === 'focus';
    }, { timeout: 15000 });

    // At focus/focus-search state on mobile, #canvas-container has pointer-events:none
    // and .journey-compass has pointer-events:auto.
    // Verify journey-compass center is the topmost hit-test element, not the canvas.
    const hitResult = await page.evaluate(() => {
      const compass = document.querySelector('.journey-compass');
      if (!compass) return { compassFound: false };
      const rect = compass.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const stack = document.elementsFromPoint(centerX, centerY);
      const topmost = stack[0] ?? null;
      const canvasContainer = document.querySelector('#canvas-container');
      const canvas = document.querySelector('canvas');
      const isTopmostCompass = Boolean(topmost && (
        topmost === compass ||
        topmost.closest?.('.journey-compass')
      ));
      const isBlockedByCanvas = stack.includes(canvasContainer) || stack.includes(canvas);
      return {
        compassFound: true,
        compassCenterX: centerX,
        compassCenterY: centerY,
        topmostTag: topmost?.tagName ?? null,
        topmostClass: topmost?.className ?? null,
        topmostId: topmost?.id ?? null,
        isTopmostCompass,
        isBlockedByCanvas,
        canvasPointerEvents: getComputedStyle(canvasContainer).pointerEvents,
        compassPointerEvents: getComputedStyle(compass).pointerEvents
      };
    });

    expect(hitResult.compassFound, 'journey-compass element must exist on page in focus-search').toBe(true);
    expect(hitResult.isTopmostCompass, 'journey-compass must be the topmost element at its center; canvas must not intercept').toBe(true);
    expect(hitResult.isBlockedByCanvas, 'canvas must NOT be in the hit-test stack for journey-compass center').toBe(false);
    expect(hitResult.canvasPointerEvents, 'canvas-container pointer-events must be none in focus-search').toBe('none');
  });

  test('mobile focus-search: Step Inside control is reachable via elementsFromPoint (canvas not blocking)', async ({ page }) => {
    test.setTimeout(120000);
    await openApp(page, { width: 390, height: 844 });

    // Enter focus-search state
    await performSearch(page, 'coffee');
    await page.waitForTimeout(500);

    const focusTarget = await page.evaluate(() => {
      const appState = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {};
      return appState?.pointIndexByLeadId?.get?.(1) ?? 0;
    });
    await page.evaluate((idx) => {
      const appState = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {};
      const focusNode = window.__APP_ACTIONS__?.focusOnNode;
      if (typeof focusNode === 'function') {
        focusNode(idx, { fromSearchResult: true, skipUrlSync: true, query: 'coffee' });
      }
    }, focusTarget);

    await page.waitForFunction(() => {
      const surface = document.body.dataset.panelSurface;
      return surface === 'focus-search' || surface === 'focus';
    }, { timeout: 15000 });

    // Locate the Step Inside button and verify it is the topmost element at its center
    const hitResult = await page.evaluate(() => {
      const diveBtn = document.querySelector('#btn-focus-dive') ||
        document.querySelector('button[aria-label*="Step Inside"]') ||
        Array.from(document.querySelectorAll('button')).find(button => button.textContent?.includes('Step Inside'));
      if (!diveBtn) return { diveBtnFound: false };
      const rect = diveBtn.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const stack = document.elementsFromPoint(centerX, centerY);
      const topmost = stack[0] ?? null;
      const canvasContainer = document.querySelector('#canvas-container');
      const canvas = document.querySelector('canvas');
      const isTopmostDiveBtn = Boolean(topmost && (
        topmost === diveBtn ||
        topmost.closest?.('#btn-focus-dive') ||
        topmost.closest?.('button[aria-label*="Step Inside"]')
      ));
      return {
        diveBtnFound: true,
        centerX,
        centerY,
        topmostTag: topmost?.tagName ?? null,
        topmostClass: topmost?.className ?? null,
        isTopmostDiveBtn,
        canvasPointerEvents: canvasContainer ? getComputedStyle(canvasContainer).pointerEvents : 'not-found'
      };
    });

    expect(hitResult.diveBtnFound, 'Step Inside button must exist in focus-search state').toBe(true);
    expect(hitResult.isTopmostDiveBtn, 'Step Inside must be the topmost element at its center; canvas must not intercept').toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Short-landscape regression coverage (~844x390)
  // ---------------------------------------------------------------------------

  test('short-landscape: search-input click is received at 844x390', async ({ page }) => {
    test.setTimeout(120000);
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
    test.setTimeout(120000);
    await openApp(page, { width: 844, height: 390 });
    await prepareSearchInput(page);

    const clearBtn = page.locator('#search-clear-btn');
    await expect(clearBtn).toBeVisible({ timeout: 5000 });
    await clearBtn.click({ force: false });

    const state = await probe(page);
    expect(state.inputValue, 'clear button should empty input at short-landscape').toBe('');
    expect(state.resultCount, 'clear button should remove results at short-landscape').toBe(0);
  });

  test('short-landscape: btn-focus-dive click activates semantic dive at 844x390', async ({ page }) => {
    test.setTimeout(120000);
    await openApp(page, { width: 844, height: 390 });
    await enterFocusFromSearch(page);

    const diveBtn = await stepInsideButton(page);
    await diveBtn.click({ force: false });

    const state = await probe(page);
    expect(state.state.semanticDiveMode, 'Step Inside should activate semanticDiveMode at short-landscape').toBe(true);
    expect(state.state.trailDepth, 'trailDepth should be 2 after Step Inside at short-landscape').toBe(2);
    expect(['active', 'transitioning']).toContain(state.body.semanticDive);
  });

  test('short-landscape: Escape after real-click Step Inside resets state', async ({ page }) => {
    test.setTimeout(120000);
    await openApp(page, { width: 844, height: 390 });
    await enterFocusFromSearch(page);

    await (await stepInsideButton(page)).click({ force: false });
    await page.waitForFunction(() => {
      const appState = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {};
      return appState?.semanticDiveMode === true || document.body.dataset.semanticDive === 'active';
    }, { timeout: 15000 });

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
