import { test, expect } from '@playwright/test';
import {
  BASE_URL,
  setupMockSearch,
  probe,
  isValidNodeIndex,
  projectedCanvasCandidates,
  readPocketNodeScales
} from './helpers/3d-interaction-helpers.js';

const HEALTH_OK = {
  ok: true,
  state: 'healthy',
  provenance: { label: 'Search ready', detail: 'Semantic search is ready.' }
};

/**
 * Open the app inside a DPR=2 browser context so click coordinates are
 * interpreted at device-pixel precision. This is distinct from the plain
 * openApp() helper which uses the default DPR=1 Playwright context.
 */
async function openAppHiDPI(browser, viewport = { width: 1440, height: 900 }, { hasTouch = false } = {}) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 2,
    ...(hasTouch ? { isMobile: true, hasTouch: true } : {})
  });
  const page = await context.newPage();

  await page.route('**/api.php?action=semantic_lane_health**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(HEALTH_OK) })
  );

  await page.goto(`${BASE_URL}/vector-explorer-polished.html?view=galaxy&nodemo=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => (
    typeof window.clearSearch === 'function' &&
    typeof window.focusOnNode === 'function' &&
    Array.isArray(window.__TEST_STATE__?.points) &&
    window.__TEST_STATE__.points.length > 0 &&
    window.__TEST_STATE__?.renderer?.domElement &&
    window.__TEST_STATE__?.camera &&
    window.__TEST_STATE__?.pointsMesh
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
  await page.evaluate(() => {
    if (typeof window.returnToOverview === 'function') {
      window.returnToOverview();
    } else if (typeof window.resetExplorationFocus === 'function') {
      window.resetExplorationFocus();
    }
  });
  await page.waitForFunction(() => window.__TEST_STATE__?.navState?.mode === 'overview', { timeout: 10000 });
  await page.waitForTimeout(900);

  return { page, context };
}

/**
 * Find a projected canvas node that is hoverable at the current DPR=2 context.
 * Returns the candidate with its resolved hover index and stable hover state.
 */
async function findClickableNodeHiDPI(page) {
  const candidates = await projectedCanvasCandidates(page);
  for (const candidate of candidates) {
    await page.mouse.move(candidate.screenX, candidate.screenY, { steps: 4 });
    await page.waitForTimeout(150);
    const state = await probe(page);
    if (state.canvasCursor === 'pointer' && isValidNodeIndex(state.hoverHighlightIndex, state.pointCount)) {
      return {
        ...candidate,
        resolvedIndex: state.hoverHighlightIndex,
        stableCanvasHover: state.stableCanvasHover
      };
    }
  }
  return null;
}

/**
 * Click a node discovered via findClickableNodeHiDPI and return both
 * the target metadata and the post-click probe state.
 */
async function clickResolvedNodeHiDPI(page) {
  const target = await findClickableNodeHiDPI(page);
  expect(target, 'a real hoverable canvas node must be discoverable at DPR=2 before click').not.toBeNull();

  await page.mouse.click(target.screenX, target.screenY);
  await page.waitForTimeout(700);
  return { target, after: await probe(page) };
}

/**
 * Verify that a focused node label is readable at DPR=2.
 * Probes the info-panel or focus-stage for non-truncated text content.
 */
async function probeLabelLegibilityHiDPI(page) {
  return page.evaluate(() => {
    const focusedNode = window.__TEST_STATE__?.focusedNode;
    if (focusedNode === null || focusedNode === undefined) return { ok: false, reason: 'no-focused-node' };

    const point = window.__TEST_STATE__?.points?.[focusedNode];
    if (!point) return { ok: false, reason: 'point-missing' };

    // Check label text is present and non-trivial
    const label = point.public_note || point.label || point.name || null;
    const hasLabel = typeof label === 'string' && label.length > 0;

    // Check info panel text content
    const infoPanel = document.querySelector('.info-panel') || document.querySelector('.focus-stage-card');
    const panelText = infoPanel?.textContent?.trim() || '';
    const panelHasContent = panelText.length > 10;

    // At DPR=2, font rendering is sharper — verify the focused node index
    // itself is stored (proof the label is tied to the right node identity)
    const focusedIndex = window.__TEST_STATE__?.navState?.focusedIndex;
    const pointCount = window.__TEST_STATE__?.points?.length ?? 0;
    const indexValid = Number.isFinite(focusedIndex) && focusedIndex >= 0 && focusedIndex < pointCount;

    return {
      ok: true,
      hasLabel,
      label: hasLabel ? label.slice(0, 60) : null,
      panelHasContent,
      panelTextExcerpt: panelText.slice(0, 80).trim(),
      focusedIndex,
      indexValid,
      devicePixelRatio: window.devicePixelRatio
    };
  });
}

test.describe('3D HiDPI click accuracy (deviceScaleFactor=2)', () => {
  test('desktop DPR=2: click on projected canvas node focuses a valid node with correct identity', async ({ browser }) => {
    test.setTimeout(70000);
    let page;
    let context;
    try {
      ({ page, context } = await openAppHiDPI(browser, { width: 1440, height: 900 }));

      // Confirm DPR=2 context is active
      const dpr = await page.evaluate(() => window.devicePixelRatio);
      expect(Math.abs(dpr - 2), 'browser context must run at DPR=2').toBeLessThan(0.05);

      const { target, after } = await clickResolvedNodeHiDPI(page);

      // Core assertions: valid focus after click
      expect(isValidNodeIndex(after.focusedNode, after.pointCount),
        'DPR=2 click must focus a valid node').toBe(true);
      expect(after.navMode, 'DPR=2 click should enter focus mode').toBe('focus');

      // Pick evidence exists and index is valid
      const pick = after.lastCanvasNodeFocusPick || after.lastCanvasNodePick;
      expect(pick, 'DPR=2 click must record canvas pick evidence').not.toBeNull();
      expect(isValidNodeIndex(pick.index, after.pointCount), 'pick index must be valid at DPR=2').toBe(true);

      // Pick coordinate must be finite
      expect(Number.isFinite(pick.screenX), 'pick screenX must be finite').toBe(true);
      expect(Number.isFinite(pick.screenY), 'pick screenY must be finite').toBe(true);

      // Pick must land near the clicked coordinate (accounting for DPR scaling)
      // screenX/Y from pick are CSS pixels; target.screenX/Y are CSS pixels from getBoundingClientRect
      // At DPR=2 the physical pixel commitment doubles but CSS pixel coords are unchanged,
      // so the same 64px tolerance applies.
      const pickDist = Math.hypot(pick.screenX - target.screenX, pick.screenY - target.screenY);
      expect(pickDist, `DPR=2 pick distance=${Math.round(pickDist)}px must be within tolerance`).toBeLessThanOrEqual(64);

      // Focused node identity must match the hovered node that was clicked
      expect(after.focusedNode, 'focusedNode must equal the resolved hover index at DPR=2').toBe(target.resolvedIndex);

    } finally {
      if (context) await context.close().catch(() => {});
    }
  });

  test('desktop DPR=2: label content is legible after focus via click', async ({ browser }) => {
    test.setTimeout(70000);
    let page;
    let context;
    try {
      ({ page, context } = await openAppHiDPI(browser, { width: 1440, height: 900 }));

      await clickResolvedNodeHiDPI(page);
      const legibility = await probeLabelLegibilityHiDPI(page);

      expect(legibility.ok, `label legibility probe must succeed: ${legibility.reason}`).toBe(true);
      expect(legibility.indexValid, 'focused node index must be valid for label association').toBe(true);
      // Panel content or label must be present to confirm legibility
      expect(legibility.panelHasContent || legibility.hasLabel,
        'DPR=2 focus state should produce non-empty label/panel content').toBe(true);
      expect(legibility.devicePixelRatio, 'DPR must be preserved in probe').toBe(2);

    } finally {
      if (context) await context.close().catch(() => {});
    }
  });

  test('mobile portrait DPR=2: tap on projected canvas node focuses a valid node', async ({ browser }) => {
    test.setTimeout(70000);
    let page;
    let context;
    try {
      ({ page, context } = await openAppHiDPI(browser, { width: 390, height: 844 }, { hasTouch: true }));

      const dpr = await page.evaluate(() => window.devicePixelRatio);
      expect(Math.abs(dpr - 2), 'mobile DPR=2 context must be active').toBeLessThan(0.05);

      // Use touch tap at DPR=2 (device-pixel scaled)
      const candidates = await projectedCanvasCandidates(page);
      expect(candidates.length, 'mobile DPR=2 must expose at least one projected canvas candidate').toBeGreaterThan(0);

      const target = candidates[0];
      await page.touchscreen.tap(target.screenX, target.screenY);
      await page.waitForTimeout(700);

      const after = await probe(page);
      expect(isValidNodeIndex(after.focusedNode, after.pointCount),
        'mobile DPR=2 tap must focus a valid node').toBe(true);
      expect(after.navMode, 'mobile DPR=2 tap should enter focus mode').toBe('focus');

      const pick = after.lastCanvasNodeFocusPick || after.lastCanvasNodePick;
      expect(pick, 'mobile DPR=2 tap must record pick evidence').not.toBeNull();
      expect(isValidNodeIndex(pick.index, after.pointCount), 'mobile DPR=2 pick index must be valid').toBe(true);

    } finally {
      if (context) await context.close().catch(() => {});
    }
  });

  test('short landscape DPR=2: projected node tap yields valid focus', async ({ browser }) => {
    test.setTimeout(70000);
    let page;
    let context;
    try {
      ({ page, context } = await openAppHiDPI(browser, { width: 844, height: 390 }, { hasTouch: true }));

      const dpr = await page.evaluate(() => window.devicePixelRatio);
      expect(Math.abs(dpr - 2), 'short-landscape DPR=2 context must be active').toBeLessThan(0.05);

      const candidates = await projectedCanvasCandidates(page, { maxResultsOverride: 6 });
      expect(candidates.length, 'short-landscape DPR=2 must expose at least one candidate').toBeGreaterThan(0);

      const target = candidates[0];
      await page.touchscreen.tap(target.screenX, target.screenY);
      await page.waitForTimeout(700);

      const after = await probe(page);
      expect(isValidNodeIndex(after.focusedNode, after.pointCount),
        'short-landscape DPR=2 tap must focus a valid node').toBe(true);
      expect(after.navMode, 'short-landscape DPR=2 tap should enter focus mode').toBe('focus');

    } finally {
      if (context) await context.close().catch(() => {});
    }
  });

  test('desktop DPR=2: click-away does not create garbage focus state', async ({ browser }) => {
    test.setTimeout(70000);
    let page;
    let context;
    try {
      ({ page, context } = await openAppHiDPI(browser, { width: 1440, height: 900 }));

      // Click in an empty corner at DPR=2
      await page.mouse.move(18, 18, { steps: 4 });
      await page.waitForTimeout(300);
      await page.mouse.click(18, 18);
      await page.waitForTimeout(400);

      const after = await probe(page);
      const noFocus = after.focusedNode === null;
      const validFocus = isValidNodeIndex(after.focusedNode, after.pointCount);
      expect(noFocus || validFocus,
        'DPR=2 away-click must leave focusedNode null or valid, not garbage').toBe(true);

    } finally {
      if (context) await context.close().catch(() => {});
    }
  });

  test('desktop DPR=2: canvas backing store reflects DPR=2 (not DPR=1)', async ({ browser }) => {
    test.setTimeout(70000);
    let page;
    let context;
    try {
      ({ page, context } = await openAppHiDPI(browser, { width: 1440, height: 900 }));

      const diag = await page.evaluate(() => {
        const canvas = window.__TEST_STATE__?.renderer?.domElement;
        if (!canvas) return null;
        const rect = canvas.getBoundingClientRect();
        return {
          cssWidth: rect.width,
          cssHeight: rect.height,
          backingWidth: canvas.width,
          backingHeight: canvas.height,
          dpr: window.devicePixelRatio
        };
      });

      expect(diag, 'canvas must be present at DPR=2').not.toBeNull();
      expect(Math.abs(diag.dpr - 2), 'devicePixelRatio must be 2').toBeLessThan(0.05);

      // At DPR=2, backing store should be approximately 2x CSS size
      const backingRatioW = diag.backingWidth / diag.cssWidth;
      const backingRatioH = diag.backingHeight / diag.cssHeight;
      expect(backingRatioW, `DPR=2 backing width ratio should be ~2, got ${backingRatioW.toFixed(2)}`)
        .toBeGreaterThan(1.8);
      expect(backingRatioH, `DPR=2 backing height ratio should be ~2, got ${backingRatioH.toFixed(2)}`)
        .toBeGreaterThan(1.8);

    } finally {
      if (context) await context.close().catch(() => {});
    }
  });
});
