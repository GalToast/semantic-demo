/**
 * 3d-state-transition-integrity.spec.js
 *
 * Contract test proving that 3D semantic state boundaries are consistent across
 * the full exploration path:
 *
 *   overview → search → focus → semantic dive → map trail → reset
 *
 * After each transition the following state dimensions must not contradict:
 *   - (window.__APP_STATE__ ?? window.__TEST_STATE__).focusedNode
 *   - (window.__APP_STATE__ ?? window.__TEST_STATE__).selectedPoint
 *   - (window.__APP_STATE__ ?? window.__TEST_STATE__).navState.mode
 *   - (window.__APP_STATE__ ?? window.__TEST_STATE__).trailDepth
 *   - (window.__APP_STATE__ ?? window.__TEST_STATE__).semanticDiveMode  (derived: trailDepth === 2)
 *   - document.body.dataset.panelSurface
 *   - document.body.dataset.graphContext
 *   - document.body.dataset.semanticDive
 *   - document.body.dataset.trailState
 *
 * Run:
 *   node --check tests/3d-state-transition-integrity.spec.js
 *   npx playwright test tests/3d-state-transition-integrity.spec.js --browser=chromium --headed
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

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Wait for the app to be fully initialised (points loaded, WebGL ready). */
async function waitForAppReady(page) {
  await page.waitForFunction(() => (
    typeof window.__APP_ACTIONS__?.clearSearch === 'function' &&
    Array.isArray(window.__TEST_STATE__?.points) &&
    (window.__APP_STATE__ ?? window.__TEST_STATE__).points.length > 0
  ), { timeout: 20000 });

  await page.waitForFunction(() => {
    const overlay = document.getElementById('loading-overlay');
    if (!overlay) return true;
    const s = getComputedStyle(overlay);
    return overlay.classList.contains('hidden') ||
      s.display === 'none' ||
      s.visibility === 'hidden' ||
      s.pointerEvents === 'none';
  }, { timeout: 20000 });

  await page.waitForFunction(() => {
    const ps = document.body?.dataset?.panelSurface;
    return ps === 'idle' || ps === 'overview';
  }, { timeout: 8000 }).catch(() => {});
}

/** Perform a mocked semantic search for the given query. */
async function performMockedSearch(page, query = 'coffee') {
  await page.route('**/api.php?action=semantic_lane_health**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SEMANTIC_HEALTH_STUB) })
  );
  await page.route('**/api.php?action=semantic_search**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SEARCH_STUB) })
  );

  const input = page.locator('#search-input');
  await input.focus();
  await input.fill(query);

  try {
    await page.waitForSelector('.search-result-item', { state: 'visible', timeout: 8000 });
  } catch {
    await page.evaluate((q) => {
      if (typeof window.__APP_ACTIONS__?.search === 'function') window.__APP_ACTIONS__.search(q);
    }, query);
    await page.waitForSelector('.search-result-item', { state: 'visible', timeout: 15000 });
  }
}

/**
 * Snapshot all state dimensions relevant to the contract.
 * Returns null if the app state is not yet initialised.
 */
async function snapshotState(page) {
  return page.evaluate(() => {
    if (typeof window.__TEST_STATE__ !== 'object' || !window.__TEST_STATE__) return null;
    const s = window.__TEST_STATE__;
    const body = document.body;
    return {
      // Core state vars
      focusedNode: s.focusedNode,
      selectedPoint: s.selectedPoint,
      navMode: s.navState?.mode ?? 'unknown',
      trailDepth: s.trailDepth ?? -1,
      semanticDiveMode: s.semanticDiveMode,
      myceliumMode: s.myceliumMode ?? 'unknown',
      currentView: s.currentView ?? 'unknown',
      // Derived from state
      hasFocus: s.focusedNode !== null && s.focusedNode !== undefined
               || s.selectedPoint != null
               || (s.navState?.focusedIndex != null),
      hasSearchIntent: Boolean(s.currentSearchSummary)
                     || String(document.getElementById('search-input')?.value ?? '').trim().length >= 2,
      // Body dataset attributes
      panelSurface: body.dataset.panelSurface || '',
      graphContext: body.dataset.graphContext || '',
      semanticDive: body.dataset.semanticDive || '',
      trailState: body.dataset.trailState || '',
      activeView: body.dataset.activeView || '',
    };
  });
}

/**
 * Assert consistency rules between state vars and derived body attributes.
 * Returns an array of failure descriptions (empty = all pass).
 */
function assertInvariants(snap) {
  const errors = [];
  const diveUiVisible = snap.semanticDiveMode && snap.currentView === 'galaxy' && snap.hasFocus;

  // rule: semanticDiveMode must equal (trailDepth === 2)
  const expectedDiveMode = snap.trailDepth === 2;
  if (snap.semanticDiveMode !== expectedDiveMode) {
    errors.push(`semanticDiveMode=${snap.semanticDiveMode} but trailDepth=${snap.trailDepth} — expected ${expectedDiveMode}`);
  }

  // rule: body.dataset.semanticDive tracks whether the galaxy-only dive UI is visible.
  // Map view may preserve semanticDiveMode/trailDepth=2 while hiding that surface.
  const expectedDiveAttr = diveUiVisible ? 'active' : 'inactive';
  if (snap.semanticDive !== expectedDiveAttr) {
    errors.push(`dataset.semanticDive=${snap.semanticDive} but diveUiVisible=${diveUiVisible} — expected ${expectedDiveAttr}`);
  }

  // rule: panelSurface must be 'semantic-dive' only while the dive UI is visible
  if (diveUiVisible && snap.panelSurface !== 'semantic-dive') {
    errors.push(`panelSurface=${snap.panelSurface} but diveUiVisible=${diveUiVisible} — expected 'semantic-dive'`);
  }

  // rule: when not in semantic dive, graphContext must be one of the known values
  const knownContexts = ['idle', 'search', 'focus', 'focus-search'];
  if (!snap.semanticDiveMode && !knownContexts.includes(snap.graphContext)) {
    errors.push(`graphContext=${snap.graphContext} is not in ${knownContexts}`);
  }

  // rule: trailDepth must be 0, 1, or 2
  if (![0, 1, 2].includes(snap.trailDepth)) {
    errors.push(`trailDepth=${snap.trailDepth} is not in [0, 1, 2]`);
  }

  // rule: navMode must be a known mode
  const knownNavModes = ['overview', 'search', 'focus', 'trail'];
  if (!knownNavModes.includes(snap.navMode)) {
    errors.push(`navMode=${snap.navMode} is not in ${knownNavModes}`);
  }

  // rule: when semanticDiveMode is active, navMode should be 'trail' (enforced by setSemanticDiveMode)
  if (snap.semanticDiveMode && snap.navMode !== 'trail') {
    errors.push(`navMode=${snap.navMode} but semanticDiveMode=${snap.semanticDiveMode} — expected navMode='trail'`);
  }

  // rule: when semanticDiveMode is active in galaxy view, body.dataset.semanticDive should be 'active'
  if (diveUiVisible && snap.semanticDive !== 'active') {
    errors.push(`dataset.semanticDive=${snap.semanticDive} but diveUiVisible=${diveUiVisible}`);
  }

  // rule: activeView must be a known view
  const knownViews = ['galaxy', 'map'];
  if (!knownViews.includes(snap.activeView)) {
    errors.push(`activeView=${snap.activeView} is not in ${knownViews}`);
  }

  // rule: trailState must be 'active' or 'inactive'
  if (!['active', 'inactive'].includes(snap.trailState)) {
    errors.push(`trailState=${snap.trailState} is not in ['active','inactive']`);
  }

  return errors;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('3D semantic state transition integrity', () => {

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${BASE_URL}/vector-explorer-polished.html?view=galaxy`, { waitUntil: 'domcontentloaded' });
    await waitForAppReady(page);
  }, 90000);

  // ── Phase 1: Overview baseline ──────────────────────────────────────────

  test('overview baseline: all state dimensions are consistent', async ({ page }) => {
    test.setTimeout(180000);

    const snap = await snapshotState(page);
    expect(snap, 'state should be initialised').not.toBeNull();

    const errors = assertInvariants(snap);
    expect(errors, 'No state contradictions in overview baseline:\n' + errors.join('\n')).toHaveLength(0);

    // Overview-specific assertions
    expect(snap.navMode, 'navMode in overview').toBe('overview');
    expect(snap.focusedNode, 'focusedNode null in overview').toBeNull();
    expect(snap.selectedPoint, 'selectedPoint null in overview').toBeNull();
    expect(snap.trailDepth, 'trailDepth 0 in overview').toBe(0);
    expect(snap.semanticDiveMode, 'semanticDiveMode false in overview').toBe(false);
  });

  // ── Phase 2: Search ───────────────────────────────────────────────────────

  test('search transition: state dimensions stay consistent', async ({ page }) => {
    test.setTimeout(180000);

    await performMockedSearch(page, 'coffee');
    await page.waitForSelector('.search-result-item', { state: 'visible', timeout: 15000 });

    const snap = await snapshotState(page);
    expect(snap, 'state should be initialised after search').not.toBeNull();

    const errors = assertInvariants(snap);
    expect(errors, 'No state contradictions in search state:\n' + errors.join('\n')).toHaveLength(0);

    // Search-specific assertions
    expect(snap.graphContext, 'graphContext in search').toMatch(/^(search|focus-search|idle)$/);
    expect(snap.semanticDiveMode, 'semanticDiveMode false in search').toBe(false);
  });

  // ── Phase 3: Focus (click a result) ────────────────────────────────────

  test('focus transition: clicking a result keeps state consistent', async ({ page }) => {
    test.setTimeout(180000);

    await performMockedSearch(page, 'coffee');
    await page.waitForSelector('.search-result-item', { state: 'visible', timeout: 15000 });

    await page.locator('.search-result-item').first().click();

    await page.waitForFunction(
      () => window.__TEST_STATE__?.navState?.mode === 'focus',
      { timeout: 15000 }
    );
    await page.waitForFunction(() => {
      const ps = document.body?.dataset?.panelSurface;
      return ps && ps.includes('focus');
    }, { timeout: 8000 }).catch(() => {});

    const snap = await snapshotState(page);
    expect(snap, 'state should be initialised after focus').not.toBeNull();

    const errors = assertInvariants(snap);
    expect(errors, 'No state contradictions in focus state:\n' + errors.join('\n')).toHaveLength(0);

    // Focus-specific assertions
    expect(snap.navMode, 'navMode in focus').toBe('focus');
    expect(snap.focusedNode, 'focusedNode should be set in focus').not.toBeNull();
    // NOTE: clicking a search result triggers trailDepth=1 as a side effect (setTrailDepth 1 is called
    // in the focus pipeline). This is working-as-designed per current codebase; trailDepth 1 means
    // the Trail chip activates but the user has not yet Stepped Inside (trailDepth 2).
    expect([0, 1]).toContain(snap.trailDepth);
    expect(snap.semanticDiveMode, 'semanticDiveMode false in focus before Step Inside').toBe(false);
    expect(snap.panelSurface, 'panelSurface in focus').toMatch(/^(focus|focus-search)$/);
  });

  // ── Phase 4: Semantic Dive (Step Inside) ─────────────────────────────────

  test('semantic dive transition: Step Inside keeps state consistent', async ({ page }) => {
    test.setTimeout(180000);

    await performMockedSearch(page, 'coffee');
    await page.waitForSelector('.search-result-item', { state: 'visible', timeout: 15000 });
    await page.locator('.search-result-item').first().click();
    await page.waitForFunction(
      () => window.__TEST_STATE__?.navState?.mode === 'focus',
      { timeout: 15000 }
    );
    await page.waitForFunction(() => {
      const ps = document.body?.dataset?.panelSurface;
      return ps && ps.includes('focus');
    }, { timeout: 8000 }).catch(() => {});

    // Step Inside: click the dive button
    const diveBtn = page.locator('#btn-focus-dive');
    const diveBtnVisible = await diveBtn.isVisible().catch(() => false);

    if (!diveBtnVisible) {
      // btn-focus-dive may not be rendered yet; trigger via JS
      await page.evaluate(() => {
        if (typeof window.__APP_ACTIONS__?.setSemanticDiveMode === 'function') {
          window.__APP_ACTIONS__.setSemanticDiveMode(true);
        }
      });
    } else {
      await diveBtn.click();
    }

    // Wait for dive mode to become active
    await page.waitForFunction(
      () => window.__TEST_STATE__?.semanticDiveMode === true,
      { timeout: 15000 }
    );
    await page.waitForFunction(() => document.body?.dataset?.semanticDive === 'active', { timeout: 10000 }).catch(() => {});

    const snap = await snapshotState(page);
    expect(snap, 'state should be initialised after semantic dive').not.toBeNull();

    const errors = assertInvariants(snap);
    expect(errors, 'No state contradictions in semantic dive:\n' + errors.join('\n')).toHaveLength(0);

    // Dive-specific assertions
    expect(snap.semanticDiveMode, 'semanticDiveMode true after Step Inside').toBe(true);
    expect(snap.trailDepth, 'trailDepth should be 2 in semantic dive').toBe(2);
    expect(snap.panelSurface, 'panelSurface should be semantic-dive in dive').toBe('semantic-dive');
    expect(snap.semanticDive, 'dataset.semanticDive should be active in dive').toBe('active');
    expect(snap.navMode, 'navMode should be trail in dive').toBe('trail');
  });

  // ── Phase 5: Map Trail (switch to map view while in dive) ───────────────

  test('map trail transition: switching to map view keeps state consistent', async ({ page }) => {
    test.setTimeout(180000);

    // Enter semantic dive first
    await performMockedSearch(page, 'coffee');
    await page.waitForSelector('.search-result-item', { state: 'visible', timeout: 15000 });
    await page.locator('.search-result-item').first().click();
    await page.waitForFunction(
      () => window.__TEST_STATE__?.navState?.mode === 'focus',
      { timeout: 15000 }
    );
    await page.waitForFunction(() => {
      const ps = document.body?.dataset?.panelSurface;
      return ps && ps.includes('focus');
    }, { timeout: 8000 }).catch(() => {});

    await page.evaluate(() => {
      if (typeof window.__APP_ACTIONS__?.setSemanticDiveMode === 'function') window.__APP_ACTIONS__.setSemanticDiveMode(true);
    });
    await page.waitForFunction(
      () => window.__TEST_STATE__?.semanticDiveMode === true,
      { timeout: 15000 }
    );
    await page.waitForFunction(() => document.body?.dataset?.semanticDive === 'active', { timeout: 10000 }).catch(() => {});

    const preMapSnap = await snapshotState(page);
    expect(preMapSnap, 'state should be initialised before map transition').not.toBeNull();
    expect(preMapSnap.semanticDiveMode, 'semantic dive must be active before switching to map').toBe(true);
    expect(preMapSnap.trailDepth, 'trailDepth should be 2 before switching to map').toBe(2);
    expect(preMapSnap.panelSurface, 'panelSurface should be semantic-dive before switching to map').toBe('semantic-dive');

    // Switch to map view
    const mapBtn = page.locator('#btn-map');
    const mapBtnVisible = await mapBtn.isVisible().catch(() => false);
    if (mapBtnVisible) {
      await mapBtn.click();
    } else {
      await page.evaluate(() => {
        window.__APP_ACTIONS__?.switchView?.('map');
      });
    }

    await page.waitForFunction(
      () => window.__TEST_STATE__?.currentView === 'map',
      { timeout: 15000 }
    );
    await page.waitForFunction(() => document.body?.dataset?.activeView === 'map', { timeout: 10000 }).catch(() => {});

    const snap = await snapshotState(page);
    expect(snap, 'state should be initialised in map trail').not.toBeNull();

    const errors = assertInvariants(snap);
    expect(errors, 'No state contradictions in map trail:\n' + errors.join('\n')).toHaveLength(0);

    // Map trail assertions
    expect(snap.activeView, 'activeView should be map in map trail').toBe('map');
    expect(snap.trailDepth, 'trailDepth must be in [0,1,2]').toBeGreaterThanOrEqual(0);
    expect(snap.trailDepth, 'trailDepth must be in [0,1,2]').toBeLessThanOrEqual(2);
    // HD-2 fix verified: semanticDiveMode is preserved across view switch (not force-cleared
    // by syncSemanticDiveUi when canDive becomes false). User can switch back to galaxy
    // and resume the dive without re-entering from scratch.
    expect(snap.semanticDiveMode, 'semanticDiveMode preserved across view switch').toBe(true);
    // Core invariant: trailDepth and semanticDiveMode must agree
    expect(snap.semanticDiveMode, 'semanticDiveMode matches trailDepth').toBe(snap.trailDepth === 2);
  });

  // ── Phase 6: Reset (return to overview from focus) ────────────────────────

  test('reset: Escape returns to overview with consistent state', async ({ page }) => {
    test.setTimeout(180000);

    // Enter focus state
    await performMockedSearch(page, 'coffee');
    await page.waitForSelector('.search-result-item', { state: 'visible', timeout: 15000 });
    await page.locator('.search-result-item').first().click();
    await page.waitForFunction(
      () => window.__TEST_STATE__?.navState?.mode === 'focus',
      { timeout: 15000 }
    );
    await page.waitForFunction(() => {
      const ps = document.body?.dataset?.panelSurface;
      return ps && ps.includes('focus');
    }, { timeout: 8000 }).catch(() => {});

    // Press Escape to reset
    await page.keyboard.press('Escape');
    await page.waitForFunction(
      () => window.__TEST_STATE__?.navState?.mode === 'overview',
      { timeout: 15000 }
    );
    await page.waitForFunction(() => {
      const ps = document.body?.dataset?.panelSurface;
      return ps === 'idle' || ps === 'overview';
    }, { timeout: 8000 }).catch(() => {});

    const snap = await snapshotState(page);
    expect(snap, 'state should be initialised after reset').not.toBeNull();

    const errors = assertInvariants(snap);
    expect(errors, 'No state contradictions after reset:\n' + errors.join('\n')).toHaveLength(0);

    // Reset assertions
    expect(snap.navMode, 'navMode overview after reset').toBe('overview');
    expect(snap.focusedNode, 'focusedNode null after reset').toBeNull();
    expect(snap.selectedPoint, 'selectedPoint null after reset').toBeNull();
    expect(snap.trailDepth, 'trailDepth 0 after reset').toBe(0);
    expect(snap.semanticDiveMode, 'semanticDiveMode false after reset').toBe(false);
  });

  // ── Phase 6b: Escape from semantic dive (trailDepth=2) ──────────────────

  test('escape-from-dive: Escape from trailDepth=2 returns to overview with all invariants intact', async ({ page }) => {
    test.setTimeout(180000);

    // Enter semantic dive (trailDepth=2)
    await performMockedSearch(page, 'coffee');
    await page.waitForSelector('.search-result-item', { state: 'visible', timeout: 15000 });
    await page.locator('.search-result-item').first().click();
    await page.waitForFunction(
      () => window.__TEST_STATE__?.navState?.mode === 'focus',
      { timeout: 15000 }
    );
    await page.waitForFunction(() => {
      const ps = document.body?.dataset?.panelSurface;
      return ps && ps.includes('focus');
    }, { timeout: 8000 }).catch(() => {});

    // Step Inside to enter dive mode (trailDepth=2)
    const diveBtn = page.locator('#btn-focus-dive');
    const diveBtnVisible = await diveBtn.isVisible().catch(() => false);
    if (diveBtnVisible) {
      await diveBtn.click();
    } else {
      await page.evaluate(() => {
        if (typeof window.__APP_ACTIONS__?.setSemanticDiveMode === 'function') {
          window.__APP_ACTIONS__.setSemanticDiveMode(true);
        }
      });
    }

    // Wait for dive mode to be active
    await page.waitForFunction(
      () => window.__TEST_STATE__?.semanticDiveMode === true && window.__TEST_STATE__?.trailDepth === 2,
      { timeout: 15000 }
    );
    await page.waitForFunction(() => document.body?.dataset?.semanticDive === 'active', { timeout: 10000 }).catch(() => {});

    // Verify preconditions before Escape
    const preSnap = await snapshotState(page);
    expect(preSnap.semanticDiveMode, 'pre: semanticDiveMode must be true before Escape').toBe(true);
    expect(preSnap.trailDepth, 'pre: trailDepth must be 2 before Escape').toBe(2);
    expect(preSnap.navMode, 'pre: navMode must be trail in dive before Escape').toBe('trail');
    expect(preSnap.semanticDive, 'pre: dataset.semanticDive must be active before Escape').toBe('active');

    // Press Escape — the primary assertion path uses real keyboard event
    await page.keyboard.press('Escape');
    await page.waitForFunction(
      () => window.__TEST_STATE__?.navState?.mode === 'overview',
      { timeout: 15000 }
    );
    await page.waitForFunction(() => {
      const ps = document.body?.dataset?.panelSurface;
      return ps === 'idle' || ps === 'overview';
    }, { timeout: 8000 }).catch(() => {});

    const snap = await snapshotState(page);
    expect(snap, 'state must be initialised after Escape from dive').not.toBeNull();

    // Run the full invariant suite — this is the core contractual proof
    const errors = assertInvariants(snap);
    expect(errors, 'No state contradictions after Escape from dive:\n' + errors.join('\n')).toHaveLength(0);

    // Dive-reset specific assertions
    expect(snap.navMode, 'navMode must be overview after Escape from dive').toBe('overview');
    expect(snap.trailDepth, 'trailDepth must be 0 after Escape from dive').toBe(0);
    expect(snap.semanticDiveMode, 'semanticDiveMode must be false after Escape from dive').toBe(false);
    expect(snap.focusedNode, 'focusedNode must be null after Escape from dive').toBeNull();
    expect(snap.selectedPoint, 'selectedPoint must be null after Escape from dive').toBeNull();
    expect(snap.semanticDive, 'dataset.semanticDive must be inactive after Escape from dive').toBe('inactive');
    expect(snap.panelSurface, 'panelSurface must not be semantic-dive after Escape from dive').not.toBe('semantic-dive');
    expect(snap.trailState, 'trailState must be inactive after Escape from dive').toBe('inactive');
  });

  // ── Phase 6c: Escape from map-trail while in semantic dive ─────────────

  test('escape-from-map-trail-dive: Escape from map view with active dive resets to overview', async ({ page }) => {
    test.setTimeout(180000);

    // Enter semantic dive (trailDepth=2)
    await performMockedSearch(page, 'coffee');
    await page.waitForSelector('.search-result-item', { state: 'visible', timeout: 15000 });
    await page.locator('.search-result-item').first().click();
    await page.waitForFunction(
      () => window.__TEST_STATE__?.navState?.mode === 'focus',
      { timeout: 15000 }
    );
    await page.waitForFunction(() => {
      const ps = document.body?.dataset?.panelSurface;
      return ps && ps.includes('focus');
    }, { timeout: 8000 }).catch(() => {});

    await page.evaluate(() => {
      if (typeof window.__APP_ACTIONS__?.setSemanticDiveMode === 'function') window.__APP_ACTIONS__.setSemanticDiveMode(true);
    });
    await page.waitForFunction(
      () => window.__TEST_STATE__?.semanticDiveMode === true,
      { timeout: 15000 }
    );
    await page.waitForFunction(() => document.body?.dataset?.semanticDive === 'active', { timeout: 10000 }).catch(() => {});

    // Switch to map view while in dive
    const mapBtn = page.locator('#btn-map');
    const mapBtnVisible = await mapBtn.isVisible().catch(() => false);
    if (mapBtnVisible) {
      await mapBtn.click();
    } else {
      await page.evaluate(() => {
        window.__APP_ACTIONS__?.switchView?.('map');
      });
    }
    await page.waitForFunction(
      () => window.__TEST_STATE__?.currentView === 'map',
      { timeout: 15000 }
    );
    await page.waitForFunction(() => document.body?.dataset?.activeView === 'map', { timeout: 10000 }).catch(() => {});

    const preSnap = await snapshotState(page);
    expect(preSnap.activeView, 'pre: activeView must be map before Escape').toBe('map');

    // Press Escape to reset back to overview
    await page.keyboard.press('Escape');
    await page.waitForFunction(
      () => window.__TEST_STATE__?.navState?.mode === 'overview',
      { timeout: 15000 }
    );
    await page.waitForFunction(() => {
      const ps = document.body?.dataset?.panelSurface;
      return ps === 'idle' || ps === 'overview';
    }, { timeout: 8000 }).catch(() => {});

    const snap = await snapshotState(page);
    expect(snap, 'state must be initialised after Escape from map-trail dive').not.toBeNull();

    const errors = assertInvariants(snap);
    expect(errors, 'No state contradictions after Escape from map-trail dive:\n' + errors.join('\n')).toHaveLength(0);

    // Map-trail-dive-reset specific assertions
    expect(snap.navMode, 'navMode must be overview after Escape from map-trail dive').toBe('overview');
    expect(snap.trailDepth, 'trailDepth must be 0 after Escape from map-trail dive').toBe(0);
    expect(snap.semanticDiveMode, 'semanticDiveMode must be false after Escape from map-trail dive').toBe(false);
    expect(snap.focusedNode, 'focusedNode must be null after Escape from map-trail dive').toBeNull();
    expect(snap.activeView, 'activeView must be galaxy (not stuck on map) after Escape from dive').toBe('galaxy');
  });

  // ── Phase 7: Full round-trip consistency ───────────────────────────────

  test('full round-trip: overview → search → focus → dive → map → reset has no contradictions', async ({ page }) => {
    test.setTimeout(180000);

    // Step 1: overview
    let snap = await snapshotState(page);
    expect(snap).not.toBeNull();
    expect(assertInvariants(snap), `Overview invariants: ${assertInvariants(snap).join('; ')}`).toHaveLength(0);

    // Step 2: search
    await performMockedSearch(page, 'coffee');
    await page.waitForSelector('.search-result-item', { state: 'visible', timeout: 15000 });
    snap = await snapshotState(page);
    expect(assertInvariants(snap), `Search invariants: ${assertInvariants(snap).join('; ')}`).toHaveLength(0);

    // Step 3: focus
    await page.locator('.search-result-item').first().click();
    await page.waitForFunction(() => window.__TEST_STATE__?.navState?.mode === 'focus', { timeout: 15000 });
    await page.waitForFunction(() => {
      const ps = document.body?.dataset?.panelSurface;
      return ps && ps.includes('focus');
    }, { timeout: 8000 }).catch(() => {});
    snap = await snapshotState(page);
    expect(assertInvariants(snap), `Focus invariants: ${assertInvariants(snap).join('; ')}`).toHaveLength(0);

    // Step 4: semantic dive
    await page.evaluate(() => {
      if (typeof window.__APP_ACTIONS__?.setSemanticDiveMode === 'function') window.__APP_ACTIONS__.setSemanticDiveMode(true);
    });
    await page.waitForFunction(() => window.__TEST_STATE__?.semanticDiveMode === true, { timeout: 15000 });
    await page.waitForFunction(() => document.body.dataset.semanticDive === 'active', { timeout: 15000 });
    snap = await snapshotState(page);
    expect(assertInvariants(snap), `Dive invariants: ${assertInvariants(snap).join('; ')}`).toHaveLength(0);

    // Step 5: map trail
    await page.evaluate(() => {
      window.__APP_ACTIONS__?.switchView?.('map');
    });
    await page.waitForFunction(() => window.__TEST_STATE__?.currentView === 'map', { timeout: 15000 });
    await page.waitForFunction(() => document.body?.dataset?.activeView === 'map', { timeout: 10000 }).catch(() => {});
    snap = await snapshotState(page);
    expect(assertInvariants(snap), `Map trail invariants: ${assertInvariants(snap).join('; ')}`).toHaveLength(0);

    // Step 6: reset back to overview
    await page.evaluate(() => {
      if (typeof window.__APP_ACTIONS__?.resetExplorationFocus === 'function') window.__APP_ACTIONS__.resetExplorationFocus();
    });
    await page.waitForFunction(() => window.__TEST_STATE__?.navState?.mode === 'overview', { timeout: 15000 });
    await page.waitForFunction(() => {
      const ps = document.body?.dataset?.panelSurface;
      return ps === 'idle' || ps === 'overview';
    }, { timeout: 8000 }).catch(() => {});
    snap = await snapshotState(page);
    expect(assertInvariants(snap), `Post-reset invariants: ${assertInvariants(snap).join('; ')}`).toHaveLength(0);

    // Final state must match overview baseline
    expect(snap.navMode).toBe('overview');
    expect(snap.focusedNode).toBeNull();
    expect(snap.selectedPoint).toBeNull();
    expect(snap.trailDepth).toBe(0);
    expect(snap.semanticDiveMode).toBe(false);
  });

  // ── Edge: dive while no focus node (should be silently ignored) ─────────

  test('dive without focus node is silently ignored', async ({ page }) => {
    test.setTimeout(180000);

    // Ensure we are in overview with no focus
    const snap0 = await snapshotState(page);
    expect(snap0.navMode).toBe('overview');

    // Try to enter dive directly from overview
    await page.evaluate(() => {
      if (typeof window.__APP_ACTIONS__?.setSemanticDiveMode === 'function') window.__APP_ACTIONS__.setSemanticDiveMode(true);
    });
    await page.waitForFunction(() => window.__TEST_STATE__?.navState?.mode === 'overview', { timeout: 5000 });

    const snap = await snapshotState(page);
    // setSemanticDiveMode(true) when canDive=false is a no-op (canDive requires currentView===galaxy AND hasFocus)
    // So semanticDiveMode should remain false
    const errors = assertInvariants(snap);
    expect(errors, `Invariants after invalid dive attempt: ${errors.join('; ')}`).toHaveLength(0);
  });
});
