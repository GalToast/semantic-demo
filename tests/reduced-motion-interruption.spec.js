/**
 * reduced-motion-interruption.spec.js
 *
 * Deterministic Playwright spec test for the reduced-motion path:
 * search/focus -> Step Inside -> interruption/recovery.
 *
 * Run:
 *   npx playwright test tests/reduced-motion-interruption.spec.js --browser=chromium
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:8795';
const APP_URL = `${BASE_URL}/vector-explorer-polished.html?nodemo=1`;

test.use({
  viewport: { width: 1440, height: 900 },
  reducedMotion: 'reduce',
});

async function waitForReady(page) {
  await page.waitForLoadState('domcontentloaded', { timeout: 8000 });
  await page.waitForFunction(() => {
    // eslint-disable-next-line no-undef
    const body = document.body?.dataset;
    const canvas = document.querySelector('#canvas-container canvas');
    return (
      body?.graphicsMode === 'webgl' &&
      canvas &&
      // eslint-disable-next-line no-undef
      window.state?.renderer &&
      // eslint-disable-next-line no-undef
      window.state?.scene &&
      // eslint-disable-next-line no-undef
      window.state?.camera &&
      // eslint-disable-next-line no-undef
      window.state?.pointsMesh?.geometry?.attributes?.position?.count > 0
    );
  }, { timeout: 12000 });
  // Give scene-reveal a moment to settle under reduced-motion
  await page.waitForTimeout(400);
}

test.describe('Reduced Motion Interruption & State Consistency', () => {
  test('Transitions resolve immediately and clear smoothly when interrupted', async ({ page }) => {
    test.setTimeout(60000);
    await page.goto(APP_URL, { waitUntil: 'commit' });
    await waitForReady(page);

    // Verify baseline
    const baseline = await page.evaluate(() => {
      const body = document.body?.dataset || {};
      const focusStage = document.getElementById('focus-stage');
      // eslint-disable-next-line no-undef
      const s = window.state || {};
      return {
        searchGlow: body.searchGlow,
        graphContext: body.graphContext,
        panelSurface: body.panelSurface,
        focusStageHidden: focusStage?.hidden ?? true,
        currentSearchSummary: s.currentSearchSummary ? 'present' : null,
        focusedNode: s.focusedNode,
      };
    });
    expect(baseline.searchGlow).toBe('inactive');
    expect(baseline.graphContext).toBe('idle');
    expect(baseline.panelSurface).toBe('idle');
    expect(baseline.focusStageHidden).toBe(true);
    expect(baseline.currentSearchSummary).toBeNull();
    expect(baseline.focusedNode).toBeNull();

    // Trigger search & focus simulation
    await page.evaluate(() => {
      // eslint-disable-next-line no-undef
      const s = window.state;
      s.currentSearchSummary = { query: 'restaurant', anchorIndex: 0, resultIndices: [0, 1, 2, 3] };
      s.searchGlowActive = true;
      s.searchGlowIndices = new Set([0, 1, 2, 3]);
      s.searchGlowTopIndex = 0;
      document.body.dataset.searchGlow = 'active';

      const point = s.points[0];
      if (point) {
        s.selectedPoint = point;
        s.focusedNode = 0;
        s.navState.focusedIndex = 0;
        s.navState.mode = 'focus';
        s.trailDepth = 1;
        document.body.dataset.graphContext = 'focus';
        document.body.dataset.panelSurface = 'focus';
        document.body.dataset.focusTransition = 'idle';
        document.body.dataset.focusTransitionPhase = 'idle';
        s.focusTransitionMode = 'idle';
      }

      // Focus-stage sync is owned by direct module callers; the window bridge is retired.
      if (typeof window.refreshCompositionState === 'function') window.refreshCompositionState();
      if (typeof window.updateExplorationUi === 'function') window.updateExplorationUi();
    });

    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

    const afterSearch = await page.evaluate(() => {
      const body = document.body?.dataset || {};
      // eslint-disable-next-line no-undef
      const s = window.state || {};
      return {
        searchGlow: body.searchGlow,
        graphContext: body.graphContext,
        panelSurface: body.panelSurface,
        currentSearchSummary: s.currentSearchSummary ? 'present' : null,
        focusedNode: s.focusedNode,
        navStateMode: s.navState?.mode,
        trailDepth: s.trailDepth,
        focusTransitionMode: s.focusTransitionMode,
      };
    });
    expect(afterSearch.searchGlow).toBe('active');
    expect(['focus', 'focus-search']).toContain(afterSearch.graphContext);
    expect(['focus', 'focus-search']).toContain(afterSearch.panelSurface);
    expect(afterSearch.currentSearchSummary).toBe('present');
    expect(afterSearch.focusedNode).toBe(0);
    expect(afterSearch.navStateMode).toBe('focus');
    expect(afterSearch.trailDepth).toBeGreaterThanOrEqual(1);

    // Enter Step Inside (trailDepth=2)
    await page.evaluate(() => {
      if (typeof window.setTrailDepth === 'function') {
        window.setTrailDepth(2, { fromUserGesture: true, skipUrlSync: true });
      } else {
        // eslint-disable-next-line no-undef
        window.state.trailDepth = 2;
      }
      if (typeof window.setMyceliumMode === 'function') {
        window.setMyceliumMode('inside', { skipUrlSync: true });
      }
      if (typeof window.refreshCompositionState === 'function') window.refreshCompositionState();
      if (typeof window.updateExplorationUi === 'function') window.updateExplorationUi();
    });

    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

    const afterFocus = await page.evaluate(() => {
      const body = document.body?.dataset || {};
      // eslint-disable-next-line no-undef
      const s = window.state || {};
      return {
        trailDepth: s.trailDepth,
        navStateMode: s.navState?.mode,
        focusedNode: s.focusedNode,
        panelSurface: body.panelSurface,
        cameraAssist: body.cameraAssist,
        focusTransition: body.focusTransition,
      };
    });
    expect(afterFocus.trailDepth).toBe(2);
    expect(afterFocus.navStateMode).toBe('inside');
    expect(afterFocus.focusedNode).toBe(0);
    expect(['focus', 'focus-search', 'semantic-dive']).toContain(afterFocus.panelSurface);

    // Interruption / Reset through the official orchestration API.
    await page.evaluate(() => {
      if (typeof window.returnToOverview === 'function') {
        window.returnToOverview();
        return;
      }
      if (typeof window.clearSearch === 'function') window.clearSearch();
      if (typeof window.resetExplorationFocus === 'function') window.resetExplorationFocus();
    });

    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

    const afterInterrupt = await page.evaluate(() => {
      const body = document.body?.dataset || {};
      const focusStage = document.getElementById('focus-stage');
      const searchResults = document.getElementById('search-results');
      const searchInput = document.getElementById('search-input');
      // eslint-disable-next-line no-undef
      const s = window.state || {};
      return {
        searchGlow: body.searchGlow,
        currentSearchSummary: s.currentSearchSummary ? 'present' : null,
        trailDepth: s.trailDepth,
        focusedNode: s.focusedNode,
        navStateMode: s.navState?.mode,
        graphContext: body.graphContext,
        panelSurface: body.panelSurface,
        focusStageHidden: focusStage?.hidden ?? true,
        searchResultsActive: searchResults?.classList?.contains('active') ?? false,
        searchInputValue: searchInput?.value ?? '',
      };
    });
    expect(afterInterrupt.searchGlow).toBe('inactive');
    expect(afterInterrupt.currentSearchSummary).toBeNull();
    expect(afterInterrupt.trailDepth).toBe(0);
    expect(afterInterrupt.focusedNode).toBeNull();
    expect(afterInterrupt.navStateMode).toBe('overview');
    expect(afterInterrupt.graphContext).toBe('idle');
    expect(afterInterrupt.panelSurface).toBe('idle');
    expect(afterInterrupt.focusStageHidden).toBe(true);
    expect(afterInterrupt.searchResultsActive).toBe(false);
    expect(afterInterrupt.searchInputValue).toBe('');
  });
});
