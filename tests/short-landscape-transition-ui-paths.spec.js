/**
 * short-landscape-transition-ui-paths.spec.js
 *
 * Transition behavior coverage for short-landscape (667x375):
 * overview -> search -> focus -> semantic-dive -> reset.
 *
 * Layout smoke is covered by short-landscape-contract.spec.js.
 * This file covers the interactive state transitions at short-landscape.
 *
 * Run:
 *   npx playwright test tests/short-landscape-transition-ui-paths.spec.js --browser=chromium --workers=1
 */

import { test, expect } from '@playwright/test';
import { setupMockSearch } from './helpers/mock-semantic-search.js';

const BASE_URL = (process.env.TEST_BASE_URL || 'http://127.0.0.1:8795').replace(/\/$/, '');
const APP_PATH = process.env.TEST_APP_PATH || '/vector-explorer-polished.html';

async function openApp(page) {
  await setupMockSearch(page);
  await page.goto(`${BASE_URL}${APP_PATH}?nodemo=1`);
  await page.waitForFunction(() => (
    typeof (window.__APP_ACTIONS__?.clearSearch ?? window.clearSearch) === 'function' &&
    typeof (window.__APP_ACTIONS__?.setSemanticDiveMode ?? window.setSemanticDiveMode) === 'function' &&
    Array.isArray(window.__TEST_STATE__?.points) &&
    (window.__APP_STATE__ ?? window.__TEST_STATE__).points.length > 0
  ), { timeout: 20000 });
  await page.waitForTimeout(1000);
}

async function performSearch(page, query = 'coffee') {
  const input = page.locator('#search-input');
  await input.focus();
  await input.fill('');
  await input.pressSequentially(query, { delay: 20 });
  await page.waitForSelector('.search-result-item', { state: 'visible', timeout: 5000 }).catch(async () => {
    await page.evaluate(async q => {
      const el = document.getElementById('search-input');
      if (el) {
        el.value = q;
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (typeof (window.__APP_ACTIONS__?.search ?? window.search) === 'function') {
        await (window.__APP_ACTIONS__?.search ?? window.search)(q, { preferCachedResults: false });
      }
    }, query);
  });
  await page.waitForSelector('.search-result-item', { state: 'visible', timeout: 15000 });
}

async function clickFirstSearchResult(page) {
  const firstResult = page.locator('.search-result-item').first();
  await expect(firstResult).toBeVisible({ timeout: 10000 });
  await firstResult.click({ force: true });
  await page.waitForFunction(() => window.__TEST_STATE__?.navState?.mode === 'focus', { timeout: 15000 });
}

async function enterSemanticDive(page) {
  const journeyInside = page.locator('.journey-compass-step[data-journey-step="inside"]');
  if (await journeyInside.isVisible().catch(() => false)) {
    await journeyInside.click({ force: true });
  } else {
    await page.locator('#btn-focus-dive').click({ force: true });
  }
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

test.describe('short-landscape viewport transitions', () => {
  test.use({ isMobile: true, hasTouch: true, viewport: { width: 667, height: 375 } });

  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}${APP_PATH}`);
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => document.body.classList.add('is-active'));
  });

  // PHASE 1: OVERVIEW — baseline state at 667x375
  test('overview baseline at 667x375', async ({ page }) => {
    test.setTimeout(60000);
    await openApp(page);

    const phase = await probe(page);
    expect(phase.state.navMode,       '[overview] navMode').toBe('overview');
    expect(phase.state.focusedNode,   '[overview] focusedNode').toBeNull();
    expect(phase.state.selectedPoint, '[overview] selectedPoint').toBeNull();
    expect(phase.state.trailDepth,    '[overview] trailDepth').toBe(0);
    expect(phase.state.semanticDiveMode, '[overview] semanticDiveMode').toBe(false);
    expect(phase.body.panelSurface,   '[overview] panelSurface').toBe('idle');
    expect(phase.body.semanticDive,   '[overview] semanticDive').toBe('inactive');
  });

  // PHASE 2: SEARCH — query 'coffee', results appear, panelSurface transitions to 'search'
  test('search transitions to search state at 667x375', async ({ page }) => {
    test.setTimeout(60000);
    await openApp(page);
    await performSearch(page);

    const phase = await probe(page);
    expect(phase.state.navMode,        '[search] navMode stays overview until click').toBe('overview');
    expect(phase.state.focusedNode,    '[search] focusedNode').toBeNull();
    expect(phase.state.trailDepth,     '[search] trailDepth').toBe(0);
    expect(phase.state.semanticDiveMode, '[search] semanticDiveMode').toBe(false);
    expect(phase.body.panelSurface,    '[search] panelSurface').toBe('search');
    expect(phase.body.semanticDive,     '[search] semanticDive').toBe('inactive');
  });

  // PHASE 3: FOCUS — click first result, navMode becomes 'focus', dive button visible
  test('focus mode entered at 667x375', async ({ page }) => {
    test.setTimeout(60000);
    await openApp(page);
    await performSearch(page);

    await clickFirstSearchResult(page);

    const phase = await probe(page);
    expect(phase.state.navMode,          '[focus] navMode').toBe('focus');
    expect(phase.state.focusedNode,      '[focus] focusedNode').not.toBeNull();
    expect(phase.state.selectedPoint,    '[focus] selectedPoint').not.toBeNull();
    expect(phase.state.focusedIndex,     '[focus] focusedIndex').not.toBeNull();
    expect(phase.state.trailDepth,       '[focus] trailDepth').toBe(1);
    expect(phase.state.semanticDiveMode, '[focus] semanticDiveMode').toBe(false);
    expect(phase.body.panelSurface,      '[focus] panelSurface').toBe('focus-search');
    expect(phase.body.semanticDive,       '[focus] semanticDive').toBe('inactive');

    // Dive button must be present at short-landscape
    await expect(page.locator('#btn-focus-dive')).toBeVisible({ timeout: 10000 });
  });

  // PHASE 4: SEMANTIC-DIVE — Step Inside clicked, trailDepth=2, semanticDiveMode=true
  test('semantic-dive mode entered at 667x375', async ({ page }) => {
    test.setTimeout(60000);
    await openApp(page);
    await performSearch(page);

    await clickFirstSearchResult(page);
    await expect(page.locator('#btn-focus-dive')).toBeVisible({ timeout: 10000 });

    await enterSemanticDive(page);

    const phase = await probe(page);
    expect(phase.state.navMode,          '[dive] navMode').toBe('trail');
    expect(phase.state.focusedNode,       '[dive] focusedNode').not.toBeNull();
    expect(phase.state.selectedPoint,    '[dive] selectedPoint').not.toBeNull();
    expect(phase.state.focusedIndex,     '[dive] focusedIndex').not.toBeNull();
    expect(phase.state.trailDepth,       '[dive] trailDepth').toBe(2);
    expect(phase.state.semanticDiveMode, '[dive] semanticDiveMode').toBe(true);
    expect(phase.body.panelSurface,       '[dive] panelSurface').toBe('semantic-dive');
    expect(phase.body.graphContext,       '[dive] graphContext').toBe('focus');
    expect(phase.body.semanticDive,       '[dive] semanticDive').toBe('active');

    // URL depth param must reflect trailDepth=2
    const url = new URL(phase.url);
    expect(url.searchParams.get('depth'), '[dive] depth param').toBe('2');
  });

  // PHASE 5: RESET — Escape returns to overview baseline at 667x375
  test('reset to overview via Escape at 667x375', async ({ page }) => {
    test.setTimeout(60000);
    await openApp(page);
    await performSearch(page);

    await clickFirstSearchResult(page);
    await expect(page.locator('#btn-focus-dive')).toBeVisible({ timeout: 10000 });

    await enterSemanticDive(page);

    // Reset
    await page.evaluate(() => document.body.focus());
    await page.keyboard.press('Escape');

    const phase5 = await expectOverviewReset(page, 'short-landscape reset');
    expect(new URL(phase5.url).searchParams.get('depth'), '[reset] depth param removed').toBeNull();
  });

  // EDGE: clear-search-btn resets from pre-focus search state at 667x375
  test('clear-search-btn resets from pre-focus state at 667x375', async ({ page }) => {
    test.setTimeout(60000);
    await openApp(page);
    await performSearch(page);

    const clearBtn = page.locator('#search-clear-btn');
    await expect(clearBtn).toBeVisible({ timeout: 10000 });

    await clearBtn.click();

    await page.waitForFunction(() =>
      window.__TEST_STATE__?.navState?.mode === 'overview' &&
      window.__TEST_STATE__?.focusedNode === null,
      { timeout: 15000 }
    );

    const after = await probe(page);
    expect(after.inputValue,   'search input must be empty after clear').toBe('');
    expect(after.resultCount,   'result count must be 0 after clear').toBe(0);

    const urlAfter = new URL(after.url);
    expect(urlAfter.searchParams.get('q'), 'q param must be removed after clear').toBeNull();
  });
});
