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
 *   npx playwright test tests/short-landscape-transition-ui-paths.spec.js --browser=chromium --workers=1 --headed
 */

import { test, expect } from '@playwright/test';
import { openApp } from './helpers/short-landscape-helpers.js';

async function performSearch(page, query = 'coffee') {
  const input = page.locator('#search-input');
  await input.focus();
  await input.fill(query);
  await page.evaluate(async q => {
    const el = document.getElementById('search-input');
    if (el) {
      el.value = q;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (typeof (window.__APP_ACTIONS__?.search) === 'function') {
      await (window.__APP_ACTIONS__?.search)(q, { preferCachedResults: false });
    }
  }, query);
  await page.waitForSelector('.search-result-item', { state: 'visible', timeout: 8000 });
}

async function clickFirstSearchResult(page) {
  const firstResult = page.locator('.search-result-item').first();
  await expect(firstResult).toBeVisible({ timeout: 8000 });
  await firstResult.click({ force: true });
  await page.waitForFunction(() => {
    const appState = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {};
    return ['focus', 'trail'].includes(appState?.navState?.mode) &&
      appState?.trailDepth === 1 &&
      document.body.dataset.panelSurface === 'focus-search';
  }, { timeout: 8000 });
}

async function enterSemanticDive(page) {
  const journeyInside = page.locator('.journey-compass-step[data-journey-step="inside"]');
  if (await journeyInside.isVisible().catch(() => false)) {
    await journeyInside.click({ force: true });
  } else {
    await page.locator('#btn-focus-dive').click({ force: true });
  }
  await page.waitForFunction(() => (
    (window.__APP_STATE__ ?? window.__TEST_STATE__)?.trailDepth === 2 &&
    (window.__APP_STATE__ ?? window.__TEST_STATE__)?.semanticDiveMode === true
  ), { timeout: 8000 });
}

async function probe(page) {
  return page.evaluate(() => {
    const appState = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {};
    return {
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
        navMode: appState?.navState?.mode || '',
        focusedNode: appState?.focusedNode ?? null,
        selectedPoint: appState?.selectedPoint ?? null,
        focusedIndex: appState?.navState?.focusedIndex ?? null,
        trailDepth: appState?.trailDepth ?? null,
        semanticDiveMode: appState?.semanticDiveMode ?? null
      }
    };
  });
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
  }, { message: `${label}: overview reset state`, timeout: 8000 }).toEqual({
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

  test('overview -> search -> clear -> focus -> semantic-dive -> reset at 667x375', async ({ page }) => {
    test.setTimeout(90000);
    await openApp(page);

    await test.step('overview baseline', async () => {
      const phase = await probe(page);
      expect(phase.state.navMode,       '[overview] navMode').toBe('overview');
      expect(phase.state.focusedNode,   '[overview] focusedNode').toBeNull();
      expect(phase.state.selectedPoint, '[overview] selectedPoint').toBeNull();
      expect(phase.state.trailDepth,    '[overview] trailDepth').toBe(0);
      expect(phase.state.semanticDiveMode, '[overview] semanticDiveMode').toBe(false);
      expect(phase.body.panelSurface,   '[overview] panelSurface').toBe('idle');
      expect(phase.body.semanticDive,   '[overview] semanticDive').toBe('inactive');
    });

    await test.step('search state', async () => {
      await performSearch(page);

      const phase = await probe(page);
      expect(phase.state.navMode,        '[search] navMode stays overview until click').toBe('overview');
      expect(phase.state.focusedNode,    '[search] focusedNode').toBeNull();
      expect(phase.state.trailDepth,     '[search] trailDepth').toBe(0);
      expect(phase.state.semanticDiveMode, '[search] semanticDiveMode').toBe(false);
      expect(phase.body.panelSurface,    '[search] panelSurface').toBe('search');
      expect(phase.body.semanticDive,     '[search] semanticDive').toBe('inactive');
    });

    await test.step('clear search from pre-focus state', async () => {
      const clearBtn = page.locator('#search-clear-btn');
      await expect(clearBtn).toBeVisible({ timeout: 10000 });

      await clearBtn.click();

      await page.waitForFunction(() => {
        const appState = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {};
        return appState?.navState?.mode === 'overview' && appState?.focusedNode === null;
      }, { timeout: 15000 });

      const after = await probe(page);
      expect(after.inputValue,   'search input must be empty after clear').toBe('');
      expect(after.resultCount,   'result count must be 0 after clear').toBe(0);

      const urlAfter = new URL(after.url);
      expect(urlAfter.searchParams.get('q'), 'q param must be removed after clear').toBeNull();
    });

    await test.step('focus mode from search result', async () => {
      await performSearch(page);
      await clickFirstSearchResult(page);

      const phase = await probe(page);
      expect(['focus', 'trail'],           '[focus] navMode').toContain(phase.state.navMode);
      expect(phase.state.focusedNode,      '[focus] focusedNode').not.toBeNull();
      expect(phase.state.selectedPoint,    '[focus] selectedPoint').not.toBeNull();
      expect(phase.state.focusedIndex,     '[focus] focusedIndex').not.toBeNull();
      expect(phase.state.trailDepth,       '[focus] trailDepth').toBe(1);
      expect(phase.state.semanticDiveMode, '[focus] semanticDiveMode').toBe(false);
      expect(phase.body.panelSurface,      '[focus] panelSurface').toBe('focus-search');
      expect(phase.body.semanticDive,       '[focus] semanticDive').toBe('inactive');

      await expect(page.locator('#btn-focus-dive')).toBeVisible({ timeout: 8000 });
    });

    await test.step('semantic-dive mode', async () => {
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

      const url = new URL(phase.url);
      expect(url.searchParams.get('depth'), '[dive] depth param').toBe('2');
    });

    await test.step('reset via Escape', async () => {
      await page.evaluate(() => document.body.focus());
      await page.keyboard.press('Escape');

      const phase5 = await expectOverviewReset(page, 'short-landscape reset');
      expect(new URL(phase5.url).searchParams.get('depth'), '[reset] depth param removed').toBeNull();
    });
  });
});
