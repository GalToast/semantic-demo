import { test, expect } from '@playwright/test';
import { BASE_URL, SEMANTIC_HEALTH_STUB, SEARCH_STUB, setupMockSearch, openApp, probe, projectedCanvasCandidates, probeFocusPocket } from './helpers/3d-interaction-helpers.js';

function isValidNodeIndex(value, pointCount) {
  return value === null || (Number.isFinite(value) && value >= 0 && value < pointCount);
}

async function findReachableNodeCoordinate(page) {
  const candidates = await projectedCanvasCandidates(page);
  for (const candidate of candidates) {
    await page.mouse.move(candidate.screenX, candidate.screenY, { steps: 4 });
    await page.waitForTimeout(140);
    const state = await probe(page);
    if (state.canvasCursor !== 'pointer' || !Number.isFinite(state.hoverHighlightIndex)) continue;

    const stack = await page.evaluate(({ x, y }) => {
      const canvas = window.state?.renderer?.domElement;
      return document.elementsFromPoint(x, y).map((el, order) => ({
        order,
        isCanvas: el === canvas,
        tag: el.tagName,
        id: el.id || '',
        className: typeof el.className === 'string' ? el.className : '',
        pointerEvents: getComputedStyle(el).pointerEvents,
        isInteractiveOverlay: !!el.closest?.([
          'button',
          'a',
          'input',
          'textarea',
          'select',
          '.info-panel',
          '.focus-stage-card',
          '.summary-card',
          '.controls',
          '.view-toggle',
          '.journey-compass',
          '.legend-panel',
          '.weather-widget',
          '.share-toggle'
        ].join(','))
      }));
    }, { x: candidate.screenX, y: candidate.screenY });

    if (stack.some(item => item.isCanvas) && !stack.some(item => item.isInteractiveOverlay && item.pointerEvents !== 'none')) {
      return { ...candidate, resolvedIndex: state.hoverHighlightIndex, stack };
    }
  }
  return null;
}

async function overlayCenters(page) {
  return page.evaluate(() => {
    const selectors = [
      '#search-panel',
      '.search-panel',
      '.info-panel',
      '.focus-stage-card',
      '.controls',
      '.view-toggle',
      '.journey-compass',
      '.legend-panel',
      '.weather-widget'
    ];
    const seen = new Set();
    const centers = [];
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (!el || seen.has(el)) continue;
      seen.add(el);
      const styles = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      if (styles.display === 'none' || styles.visibility === 'hidden' || styles.pointerEvents === 'none') continue;
      if (rect.width < 8 || rect.height < 8) continue;
      centers.push({
        selector,
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
      });
    }
    return centers;
  });
}

async function clearPickEvidence(page) {
  await page.evaluate(() => {
    window.__lastCanvasNodePick = null;
    window.__lastCanvasNodeFocusPick = null;
    window.state.focusedNode = null;
    if (window.state.navState) {
      window.state.navState.focusedIndex = null;
      window.state.navState.mode = 'overview';
    }
  });
}

test.describe('3D overlay hit ownership', () => {
  test('desktop: reachable node coordinate includes canvas and excludes interactive overlays', async ({ page }) => {
    test.setTimeout(60000);
    await openApp(page, { width: 1440, height: 900 });

    const target = await findReachableNodeCoordinate(page);
    expect(target, 'a hoverable node coordinate should be reachable through the canvas hit stack').not.toBeNull();
    expect(target.stack.some(item => item.isCanvas), `canvas should be present in hit stack: ${JSON.stringify(target.stack)}`).toBe(true);
    expect(target.stack.some(item => item.isInteractiveOverlay && item.pointerEvents !== 'none'), `interactive overlay should not cover reachable node: ${JSON.stringify(target.stack)}`).toBe(false);
  });

  test('desktop: overlay clicks do not create canvas pick evidence', async ({ page }) => {
    test.setTimeout(60000);
    await openApp(page, { width: 1440, height: 900 });
    await clearPickEvidence(page);

    const centers = await overlayCenters(page);
    expect(centers.length, 'at least one overlay surface should be present').toBeGreaterThan(0);

    for (const center of centers.slice(0, 4)) {
      await page.mouse.click(center.x, center.y);
      await page.waitForTimeout(160);
    }

    const after = await probe(page);
    expect(isValidNodeIndex(after.focusedNode, after.pointCount), 'overlay clicks must leave focusedNode null or valid').toBe(true);
    expect(after.lastCanvasNodePick, 'overlay clicks should not set lastCanvasNodePick').toBeNull();
    expect(after.lastCanvasNodeFocusPick, 'overlay clicks should not set lastCanvasNodeFocusPick').toBeNull();
  });

  test('mobile portrait: overlay click does not leak into canvas focus', async ({ page }) => {
    test.setTimeout(60000);
    await openApp(page, { width: 390, height: 844 });
    await clearPickEvidence(page);

    const centers = await overlayCenters(page);
    expect(centers.length, 'mobile overlay surface should be present').toBeGreaterThan(0);
    await page.mouse.click(centers[0].x, centers[0].y);
    await page.waitForTimeout(200);

    const after = await probe(page);
    expect(isValidNodeIndex(after.focusedNode, after.pointCount), 'mobile overlay click must leave focusedNode null or valid').toBe(true);
    expect(after.lastCanvasNodeFocusPick, 'mobile overlay click must not create canvas focus pick').toBeNull();
  });

  test('short landscape: reachable node still avoids overlay hit-stealing', async ({ page }) => {
    test.setTimeout(60000);
    await openApp(page, { width: 844, height: 390 });

    const target = await findReachableNodeCoordinate(page);
    expect(target, 'short landscape should keep at least one node reachable around overlays').not.toBeNull();
    expect(target.stack.some(item => item.isCanvas), `canvas should remain in short-landscape hit stack: ${JSON.stringify(target?.stack)}`).toBe(true);
  });

  test('short landscape: focus pocket nodes are not consumed by overlay hit-stealing', async ({ page }) => {
    test.setTimeout(60000);
    await openApp(page, { width: 844, height: 390 });

    const entryIndex = await page.evaluate(() => {
      const pts = window.state.points;
      if (!pts || pts.length === 0) return 0;
      for (let i = 0; i < Math.min(pts.length, 20); i++) {
        const pt = pts[i];
        if (pt && window.state.pointIndexByLeadId.has(pt.lead_id)) {
          const node = window.state.semanticNeighborMapByLeadId?.get(pt.lead_id);
          if (node?.neighbors?.length > 0) return i;
        }
      }
      return 0;
    });

    await page.evaluate(idx => {
      if (typeof window.focusOnNode === 'function') window.focusOnNode(idx);
    }, entryIndex);
    await page.waitForFunction(() => window.state?.navState?.mode === 'focus', { timeout: 15000 });
    await page.waitForTimeout(1000);

    const pocket = await probeFocusPocket(page);
    expect(pocket.pocketSize, 'short-landscape pocket must have nodes').toBeGreaterThan(0);

    // At least one pocket node must be reachable at its screen coordinate
    expect(pocket.reachableCount, `short-landscape pocket must retain reachable nodes, got ${pocket.reachableCount}`).toBeGreaterThan(0);
  });
});
