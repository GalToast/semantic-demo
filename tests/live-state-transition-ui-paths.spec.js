import { test, expect } from '@playwright/test';
import { setupMockSearch } from './helpers/mock-semantic-search.js';

const BASE_URL = (process.env.TEST_BASE_URL || 'http://127.0.0.1:8795').replace(/\/$/, '');

async function openApp(page) {
  await setupMockSearch(page);
  await page.goto(`${BASE_URL}/vector-explorer-polished.html?nodemo=1`);
  await page.waitForFunction(() => (
    typeof window.clearSearch === 'function' &&
    typeof window.setSemanticDiveMode === 'function' &&
    Array.isArray(window.__TEST_STATE__?.points) &&
    window.__TEST_STATE__.points.length > 0
  ), { timeout: 20000 });
  await page.waitForTimeout(1000);
}

async function performSearch(page, query = 'coffee') {
  const input = page.locator('#search-input');
  await input.focus();
  // Clear any pre-existing value so every keystroke registers as a change
  await input.fill('');
  await input.pressSequentially(query, { delay: 20 });
  await page.waitForSelector('.search-result-item', { state: 'visible', timeout: 5000 }).catch(async () => {
    await page.evaluate(async q => {
      const el = document.getElementById('search-input');
      if (el) {
        el.value = q;
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (typeof window.search === 'function') {
        await window.search(q, { preferCachedResults: false });
      }
    }, query);
  });
  await page.waitForSelector('.search-result-item', { state: 'visible', timeout: 15000 });
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
    document.body.dataset.semanticDive === 'active'
  ), { timeout: 15000 });
}

async function probe(page) {
  return page.evaluate(() => ({
    inputValue: document.getElementById('search-input')?.value ?? '',
    resultCount: document.querySelectorAll('.search-result-item').length,
    url: location.href,
    body: {
      panelSurface: document.body.dataset.panelSurface || '',
      semanticDive: document.body.dataset.semanticDive || '',
      graphContext: document.body.dataset.graphContext || '',
      trailDepth: document.body.dataset.trailDepth || ''
    },
    state: {
      navMode: window.__TEST_STATE__?.navState?.mode || '',
      focusedNode: window.__TEST_STATE__?.focusedNode ?? null,
      selectedPoint: window.__TEST_STATE__?.selectedPoint ?? null,
      focusedIndex: window.__TEST_STATE__?.navState?.focusedIndex ?? null,
      trailDepth: window.__TEST_STATE__?.trailDepth ?? null,
      semanticDiveMode: window.__TEST_STATE__?.semanticDiveMode ?? null
    }
  }));
}

async function expectOverviewReset(page, label) {
  await expect.poll(async () => {
    const state = await probe(page);
    return {
      navMode: state.state.navMode,
      focusedNode: state.state.focusedNode,
      trailDepth: state.state.trailDepth,
      semanticDiveMode: state.state.semanticDiveMode,
      semanticDive: state.body.semanticDive,
      panelSurface: state.body.panelSurface
    };
  }, { message: `${label}: overview reset state`, timeout: 15000 }).toEqual({
    navMode: 'overview',
    focusedNode: null,
    trailDepth: 0,
    semanticDiveMode: false,
    semanticDive: 'inactive',
    panelSurface: 'idle'
  });
  return probe(page);
}

/**
 * Full-phase state tuple assertion at every step of the exploration lifecycle.
 * Covers: overview → search → focus → semantic-dive → reset.
 * Asserts: focusedNode, selectedPoint, navState.focusedIndex, trailDepth,
 *          semanticDiveMode, body.dataset.panelSurface, graphContext,
 *          semanticDive, trailDepth.
 */
test('desktop: full-phase state tuple at every exploration step', async ({ page }) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);

  // ── PHASE 1: OVERVIEW ─────────────────────────────────────────────────────
  const phase1 = await probe(page);
  expect(phase1.state.navMode,        '[overview] navMode').toBe('overview');
  expect(phase1.state.focusedNode,    '[overview] focusedNode').toBeNull();
  expect(phase1.state.selectedPoint,  '[overview] selectedPoint').toBeNull();
  expect(phase1.state.focusedIndex,  '[overview] focusedIndex').toBeNull();
  expect(phase1.state.trailDepth,     '[overview] trailDepth').toBe(0);
  expect(phase1.state.semanticDiveMode, '[overview] semanticDiveMode').toBe(false);
  expect(phase1.body.panelSurface,    '[overview] panelSurface').toBe('idle');
  expect(phase1.body.graphContext,    '[overview] graphContext').toBe('idle');
  expect(phase1.body.semanticDive,    '[overview] semanticDive').toBe('inactive');
  expect(phase1.body.trailDepth,      '[overview] trailDepth dataset').toBe('0');

  // ── PHASE 2: SEARCH ───────────────────────────────────────────────────────
  await performSearch(page);

  const phase2 = await probe(page);
  // Results are visible but navMode stays 'overview' until a result is selected
  expect(phase2.state.navMode,        '[search] navMode stays overview until click').toBe('overview');
  expect(phase2.state.focusedNode,    '[search] focusedNode').toBeNull();
  expect(phase2.state.selectedPoint,  '[search] selectedPoint').toBeNull();
  expect(phase2.state.focusedIndex,  '[search] focusedIndex').toBeNull();
  expect(phase2.state.trailDepth,     '[search] trailDepth').toBe(0);
  expect(phase2.state.semanticDiveMode, '[search] semanticDiveMode').toBe(false);
  expect(phase2.body.panelSurface,    '[search] panelSurface').toBe('search');
  expect(phase2.body.semanticDive,    '[search] semanticDive').toBe('inactive');

  // ── PHASE 3: FOCUS ────────────────────────────────────────────────────────
  await page.locator('.search-result-item').first().click();
  await page.waitForFunction(() => window.__TEST_STATE__?.navState?.mode === 'focus', { timeout: 15000 });
  await expect(page.locator('#btn-focus-dive')).toBeVisible({ timeout: 10000 });

  const phase3 = await probe(page);
  expect(phase3.state.navMode,          '[focus] navMode').toBe('focus');
  expect(phase3.state.focusedNode,      '[focus] focusedNode').not.toBeNull();
  expect(phase3.state.selectedPoint,    '[focus] selectedPoint').not.toBeNull();
  expect(phase3.state.focusedIndex,     '[focus] focusedIndex').not.toBeNull();
  expect(phase3.state.trailDepth,       '[focus] trailDepth').toBe(1);
  expect(phase3.state.semanticDiveMode, '[focus] semanticDiveMode').toBe(false);
  expect(phase3.body.panelSurface,      '[focus] panelSurface').toBe('focus-search');
  expect(phase3.body.graphContext,      '[focus] graphContext').toBe('focus-search');
  expect(phase3.body.semanticDive,      '[focus] semanticDive').toBe('inactive');

  // ── PHASE 4: SEMANTIC-DIVE ────────────────────────────────────────────────
  await stepInside(page);

  const phase4 = await probe(page);
  expect(phase4.state.navMode,          '[dive] navMode').toBe('trail');
  expect(phase4.state.focusedNode,       '[dive] focusedNode').not.toBeNull();
  expect(phase4.state.selectedPoint,    '[dive] selectedPoint').not.toBeNull();
  expect(phase4.state.focusedIndex,     '[dive] focusedIndex').not.toBeNull();
  expect(phase4.state.trailDepth,       '[dive] trailDepth').toBe(2);
  expect(phase4.state.semanticDiveMode, '[dive] semanticDiveMode').toBe(true);
  expect(phase4.body.panelSurface,      '[dive] panelSurface').toBe('semantic-dive');
  expect(phase4.body.graphContext,      '[dive] graphContext').toBe('focus');
  expect(phase4.body.semanticDive,       '[dive] semanticDive').toBe('active');

  // URL depth param must reflect trailDepth=2
  const urlDive = new URL(phase4.url);
  expect(urlDive.searchParams.get('depth'), '[dive] depth param').toBe('2');

  // ── PHASE 5: RESET ────────────────────────────────────────────────────────
  await page.evaluate(() => document.body.focus());
  await page.keyboard.press('Escape');

  const phase5 = await expectOverviewReset(page, 'desktop full-phase reset');
  expect(new URL(phase5.url).searchParams.get('depth'), '[reset] depth param removed').toBeNull();
});

// Test 2: desktop full path search → focus → semantic-dive → reset via Escape
test('desktop full path search → focus → semantic-dive → reset via Escape', async ({ page }) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);

  // Perform search
  await performSearch(page);

  // Click first result → enter focus
  await page.locator('.search-result-item').first().click();
  await page.waitForFunction(() => window.__TEST_STATE__?.navState?.mode === 'focus', { timeout: 15000 });

  // Wait for Step Inside button and click it
  await expect(page.locator('#btn-focus-dive')).toBeVisible({ timeout: 10000 });
  await stepInside(page);

  // Verify URL depth param
  const afterDive = await probe(page);
  const url = new URL(afterDive.url);
  expect(url.searchParams.get('depth'), 'depth param must be 2 after Step Inside').toBe('2');

  // Verify body dataset states
  expect(afterDive.body.semanticDive, 'semanticDive must be active').toBe('active');
  expect(afterDive.body.panelSurface, 'panelSurface must be semantic-dive').toBe('semantic-dive');
  expect(afterDive.body.graphContext, 'graphContext must be focus').toBe('focus');

  // Press Escape → reset to overview
  await page.evaluate(() => document.body.focus());
  await page.keyboard.press('Escape');

  // Wait for overview reset
  await page.waitForFunction(() =>
    window.__TEST_STATE__?.navState?.mode === 'overview' &&
    window.__TEST_STATE__?.trailDepth === 0 &&
    window.__TEST_STATE__?.semanticDiveMode === false,
    { timeout: 15000 }
  );

  const afterReset = await probe(page);
  expect(afterReset.body.semanticDive, 'semanticDive must be inactive after Escape').toBe('inactive');
  expect(afterReset.body.panelSurface, 'panelSurface must be idle after Escape').toBe('idle');

  // Verify URL depth param is gone
  const urlAfterReset = new URL(afterReset.url);
  expect(urlAfterReset.searchParams.get('depth'), 'depth param must be removed after Escape').toBeNull();

  // Verify focus panel is not visible (no overlap)
  const focusStage = page.locator('#focus-stage');
  const focusPanel = page.locator('.focus-panel');
  const focusStageVisible = await focusStage.isVisible().catch(() => false);
  const focusPanelVisible = await focusPanel.isVisible().catch(() => false);

  if (focusStageVisible || focusPanelVisible) {
    const box = await (focusStageVisible ? focusStage : focusPanel).boundingBox();
    const hasZeroArea = box && (box.width === 0 || box.height === 0);
    expect(hasZeroArea, 'focus panel must have zero area or be hidden after reset').toBe(true);
  } else {
    expect(true, 'focus stage and panel are hidden after reset').toBe(true);
  }
});

// Test 2: mobile full path search → focus → semantic-dive → reset
test('mobile full path search → focus → semantic-dive → reset', async ({ page }) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page);

  await performSearch(page);
  await page.locator('.search-result-item').first().click();
  await page.waitForFunction(() => window.__TEST_STATE__?.navState?.mode === 'focus', { timeout: 15000 });

  await expect(page.locator('#btn-focus-dive')).toBeVisible({ timeout: 10000 });
  await stepInside(page);

  const afterDive = await probe(page);
  expect(afterDive.body.semanticDive).toBe('active');
  expect(afterDive.body.panelSurface).toBe('semantic-dive');

  await page.evaluate(() => document.body.focus());
  await page.keyboard.press('Escape');

  await page.waitForFunction(() =>
    window.__TEST_STATE__?.navState?.mode === 'overview' &&
    window.__TEST_STATE__?.trailDepth === 0 &&
    window.__TEST_STATE__?.semanticDiveMode === false,
    { timeout: 15000 }
  );

  const afterReset = await probe(page);
  expect(afterReset.state.navMode, 'navMode must be overview after mobile Escape').toBe('overview');
  expect(afterReset.state.focusedNode, 'focusedNode must be null after mobile Escape').toBeNull();
  expect(afterReset.state.trailDepth, 'trailDepth must be 0 after mobile Escape').toBe(0);
  expect(afterReset.state.semanticDiveMode, 'semanticDiveMode must be false after mobile Escape').toBe(false);
  expect(afterReset.body.semanticDive, 'semanticDive must be inactive after mobile Escape').toBe('inactive');
  expect(afterReset.body.panelSurface, 'panelSurface must be idle after mobile Escape').toBe('idle');
});

// Test 3: desktop search → clear-search-btn resets from pre-focus state
// The clear button appears when search results are visible, BEFORE entering focus.
// After clicking a result, the results panel is replaced by the focus detail panel
// and #search-clear-btn is hidden. The Escape key is the reset path from focus mode.
test('desktop search → clear-search-btn resets from pre-focus state', async ({ page }) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);

  // Perform search — results are visible before focus mode
  await performSearch(page);

  // Verify clear button is visible with search results rendered
  const clearBtn = page.locator('#search-clear-btn');
  await expect(clearBtn).toBeVisible({ timeout: 10000 });

  // Clear button resets to overview from pre-focus state
  await clearBtn.click();

  await page.waitForFunction(() =>
    window.__TEST_STATE__?.navState?.mode === 'overview' &&
    window.__TEST_STATE__?.focusedNode === null,
    { timeout: 15000 }
  );

  const after = await probe(page);
  expect(after.inputValue, 'search input must be empty after clear button').toBe('');
  expect(after.resultCount, 'result count must be 0 after clear button').toBe(0);

  const urlAfter = new URL(after.url);
  expect(urlAfter.searchParams.get('q'), 'q param must be removed after clear button').toBeNull();
});

// Test 4: desktop: clear-search while already in focus mode resets to overview
// Gap caught: clear-search-btn was only tested from pre-focus state (Test 3).
// When the user is already in focus mode (after clicking a search result),
// the results panel is gone and #search-clear-btn is hidden, but the search
// input still carries the query. The clear-search handler (which the button
// triggers) calls clearSearch() → resetExplorationFocus() which resets
// navState.mode to 'overview' and clears focusedNode/selectedPoint.
// This test calls window.clearSearch() directly (same handler the button
// fires) and verifies the in-focus-to-overview reset path.
test('desktop: clear-search resets from in-focus mode (not just pre-focus)', async ({ page }) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);

  // Enter focus mode by clicking a search result
  await enterFocusFromSearch(page);

  // Verify we are in focus mode with a selected point
  const preClear = await probe(page);
  expect(preClear.state.navMode, 'navMode must be focus before clear').toBe('focus');
  expect(preClear.state.focusedNode, 'focusedNode must be set before clear').not.toBeNull();
  expect(preClear.state.selectedPoint, 'selectedPoint must be set before clear').not.toBeNull();
  expect(preClear.body.panelSurface, 'panelSurface must be focus-search before clear').toBe('focus-search');

  // The #search-clear-btn is hidden in focus mode (results panel replaced by
  // focus detail panel, so .search-container.has-query is not set). Call
  // clearSearch() directly — same handler the button triggers.
  await page.evaluate(() => window.clearSearch());

  await page.waitForFunction(() =>
    window.__TEST_STATE__?.navState?.mode === 'overview' &&
    window.__TEST_STATE__?.focusedNode === null,
    { timeout: 15000 }
  );

  const after = await probe(page);
  expect(after.inputValue, 'search input must be empty after clear from focus mode').toBe('');
  expect(after.state.navMode, 'navMode must be overview after clear from focus').toBe('overview');
  expect(after.state.focusedNode, 'focusedNode must be null after clear from focus').toBeNull();
  expect(after.state.selectedPoint, 'selectedPoint must be null after clear from focus').toBeNull();
  expect(after.body.panelSurface, 'panelSurface must be idle after clear from focus').toBe('idle');

  const urlAfter = new URL(after.url);
  expect(urlAfter.searchParams.get('q'), 'q param must be removed after clear from focus').toBeNull();

  expect(urlAfter.searchParams.get('record'), 'record URL param must be removed after clear from focus').toBeNull();
});

// Test 5: semantic-dive reset also clears focus-panel overlap
test('semantic-dive reset also clears focus-panel overlap', async ({ page }) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);

  await enterFocusFromSearch(page);
  await stepInside(page);

  // Press Escape to reset
  await page.evaluate(() => document.body.focus());
  await page.keyboard.press('Escape');

  // Wait for overview reset
  await page.waitForFunction(() =>
    window.__TEST_STATE__?.navState?.mode === 'overview' &&
    window.__TEST_STATE__?.semanticDiveMode === false,
    { timeout: 15000 }
  );

  const { focusStageCleared, focusPanelCleared } = await page.evaluate(() => {
    const isCleared = selector => {
      const el = document.querySelector(selector);
      if (!el) return true;
      const style = getComputedStyle(el);
      return style.display === 'none' ||
        style.visibility === 'hidden' ||
        el.offsetWidth === 0 ||
        el.offsetHeight === 0;
    };
    return {
      focusStageCleared: isCleared('#focus-stage'),
      focusPanelCleared: isCleared('.focus-panel')
    };
  });

  expect(focusStageCleared || focusPanelCleared, 'focus stage or panel must be cleared after semantic-dive reset').toBe(true);
});
