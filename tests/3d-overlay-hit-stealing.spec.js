import { test, expect } from '@playwright/test';
import { openApp, probe, projectedCandidates, probeFocusPocket, focusNodeViaApp } from './helpers/3d-interaction-helpers.js';
import { mutate } from './helpers/state-harness.js';

function isValidNodeIndex(value, pointCount) {
  return value === null || (Number.isFinite(value) && value >= 0 && value < pointCount);
}

async function clearPickEvidence(page) {
  await mutate(page, 'clearPickEvidence');
}

async function findReachableNodeCoordinate(page) {
  const passes = [
    { marginRatio: 0.08, maxResults: 24 },
    { marginRatio: 0.05, maxResults: 36 },
    { marginRatio: 0.03, maxResults: 48 },
  ];
  for (const pass of passes) {
    const candidates = await projectedCandidates(page, pass);
    for (const candidate of candidates) {
      await page.mouse.move(candidate.screenX, candidate.screenY, { steps: 4 });
      await page.waitForFunction(() => {
        const h = window.__TEST_STATE__?.hoverHighlightIndex;
        return h !== null && h !== undefined && Number.isFinite(h);
      }, { timeout: 5000 }).catch(() => {});
      const state = await probe(page);
      if (state.canvasCursor !== 'pointer' || !Number.isFinite(state.hoverHighlightIndex)) continue;

      const stack = await page.evaluate(({ x, y }) => {
        const state = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {};
        const canvas = state.renderer?.domElement;
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
    await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => r(true))), { timeout: 3000 }).catch(() => {});
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

test.describe('3D overlay hit ownership', () => {
  test('desktop: reachable node coordinate includes canvas and excludes interactive overlays', async ({ page }) => {
    test.setTimeout(90000);
    await openApp(page, { width: 1440, height: 900 });

    const target = await findReachableNodeCoordinate(page);
    expect(target, 'a hoverable node coordinate should be reachable through the canvas hit stack').not.toBeNull();
    expect(target.stack.some(item => item.isCanvas), `canvas should be present in hit stack: ${JSON.stringify(target.stack)}`).toBe(true);
    expect(target.stack.some(item => item.isInteractiveOverlay && item.pointerEvents !== 'none'), `interactive overlay should not cover reachable node: ${JSON.stringify(target.stack)}`).toBe(false);
  });

  test('desktop: overlay clicks do not create canvas pick evidence', async ({ page }) => {
    test.setTimeout(90000);
    await openApp(page, { width: 1440, height: 900 });
    await clearPickEvidence(page);

    const centers = await overlayCenters(page);
    expect(centers.length, 'at least one overlay surface should be present').toBeGreaterThan(0);

    for (const center of centers.slice(0, 4)) {
      await page.mouse.click(center.x, center.y);
      await page.waitForFunction(() => {
        const s = window.__APP_STATE__ ?? window.__TEST_STATE__;
        return s?.lastCanvasNodePick || s?.focusedNode !== null || s?.navState?.mode;
      }, { timeout: 5000 }).catch(() => {});
    }

    const after = await probe(page);
    expect(isValidNodeIndex(after.focusedNode, after.pointCount), 'overlay clicks must leave focusedNode null or valid').toBe(true);
    expect(after.lastCanvasNodePick, 'overlay clicks should not set lastCanvasNodePick').toBeNull();
    expect(after.lastCanvasNodeFocusPick, 'overlay clicks should not set lastCanvasNodeFocusPick').toBeNull();
  });

  test('mobile portrait: overlay click does not leak into canvas focus', async ({ page }) => {
    test.setTimeout(80000);
    await openApp(page, { width: 390, height: 844 });
    await clearPickEvidence(page);

    const centers = await overlayCenters(page);
    expect(centers.length, 'mobile overlay surface should be present').toBeGreaterThan(0);
    await page.mouse.click(centers[0].x, centers[0].y);
    await page.waitForFunction(() => {
        const s = window.__APP_STATE__ ?? window.__TEST_STATE__;
        return s?.lastCanvasNodePick || s?.focusedNode !== null || s?.navState?.mode;
      }, { timeout: 5000 }).catch(() => {});

    const after = await probe(page);
    expect(isValidNodeIndex(after.focusedNode, after.pointCount), 'mobile overlay click must leave focusedNode null or valid').toBe(true);
    expect(after.lastCanvasNodeFocusPick, 'mobile overlay click must not create canvas focus pick').toBeNull();
  });

  test('short landscape: reachable node still avoids overlay hit-stealing', async ({ page }) => {
    test.setTimeout(90000);
    await openApp(page, { width: 844, height: 390 });

    const target = await findReachableNodeCoordinate(page);
    expect(target, 'short landscape should keep at least one node reachable around overlays').not.toBeNull();
    expect(target.stack.some(item => item.isCanvas), `canvas should remain in short-landscape hit stack: ${JSON.stringify(target?.stack)}`).toBe(true);
  });

  test('short landscape: focus pocket nodes are not consumed by overlay hit-stealing', async ({ page }) => {
    test.setTimeout(90000);
    await openApp(page, { width: 844, height: 390 });

    const entryIndex = await page.evaluate(() => {
      const state = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {};
      const pts = state.points;
      if (!pts || pts.length === 0) return 0;
      for (let i = 0; i < Math.min(pts.length, 20); i++) {
        const pt = pts[i];
        if (pt && state.pointIndexByLeadId?.has(pt.lead_id)) {
          const node = state.semanticNeighborMapByLeadId?.get(pt.lead_id);
          if (node?.neighbors?.length > 0) return i;
        }
      }
      return 0;
    });

    if (entryIndex >= 0) await focusNodeViaApp(page, entryIndex);
    await page.waitForFunction(() => ((window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}).navState?.mode === 'focus'), { timeout: 15000 });
    await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => r(true))), { timeout: 5000 }).catch(() => {});

    const pocket = await probeFocusPocket(page);
    expect(pocket.pocketSize, 'short-landscape pocket must have nodes').toBeGreaterThan(0);

    // At least one pocket node must be reachable at its screen coordinate
    expect(pocket.reachableCount, `short-landscape pocket must retain reachable nodes, got ${pocket.reachableCount}`).toBeGreaterThan(0);
  });

  test('mobile-portrait: focus neighborhood nodes are not consumed by overlay hit-stealing at 390x844', async ({ page }) => {
    test.setTimeout(90000);
    await openApp(page, { width: 390, height: 844 });

    const entryIndex = await page.evaluate(() => {
      const state = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {};
      const pts = state.points;
      if (!pts || pts.length === 0) return 0;
      for (let i = 0; i < Math.min(pts.length, 20); i++) {
        const pt = pts[i];
        if (pt && state.pointIndexByLeadId?.has(pt.lead_id)) {
          const node = state.semanticNeighborMapByLeadId?.get(pt.lead_id);
          if (node?.neighbors?.length > 0) return i;
        }
      }
      return 0;
    });

    if (entryIndex >= 0) await focusNodeViaApp(page, entryIndex);
    await page.waitForFunction(() => ((window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}).navState?.mode === 'focus'), { timeout: 15000 });
    await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => r(true))), { timeout: 5000 }).catch(() => {});

    const pocket = await probeFocusPocket(page);
    expect(pocket.pocketSize, 'mobile-portrait pocket must be populated').toBeGreaterThan(0);
    expect(pocket.reachableCount, `mobile-portrait pocket must retain reachable nodes, got ${pocket.reachableCount}`).toBeGreaterThan(0);
  });

  test('mobile-portrait: clicking near a focus-neighborhood node does not create spurious canvas focus pick at 390x844', async ({ page }) => {
    test.setTimeout(90000);
    await openApp(page, { width: 390, height: 844 });

    const entryIndex = await page.evaluate(() => {
      const state = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {};
      const pts = state.points;
      if (!pts || pts.length === 0) return 0;
      for (let i = 0; i < Math.min(pts.length, 20); i++) {
        const pt = pts[i];
        if (pt && state.pointIndexByLeadId?.has(pt.lead_id)) {
          const node = state.semanticNeighborMapByLeadId?.get(pt.lead_id);
          if (node?.neighbors?.length > 0) return i;
        }
      }
      return 0;
    });

    if (entryIndex >= 0) await focusNodeViaApp(page, entryIndex);
    await page.waitForFunction(() => ((window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}).navState?.mode === 'focus'), { timeout: 15000 });
    await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => r(true))), { timeout: 5000 }).catch(() => {});

    const centers = await overlayCenters(page);

    // Get projected screen coordinates of 2-3 focus-neighborhood nodes
    const neighborhoodScreenPoints = await page.evaluate(() => {
      const state = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {};
      const nav = state.navState;
      if (!nav || nav.mode !== 'focus' || !Number.isFinite(nav.focusedIndex)) return [];
      const anchorIdx = nav.focusedIndex;
      const pts = state.points;
      const semanticMap = state.semanticNeighborMapByLeadId;
      if (!pts || !semanticMap) return [];

      const anchorLeadId = pts[anchorIdx]?.lead_id;
      const anchorNeighbors = semanticMap.get(anchorLeadId)?.neighbors || [];
      const allIndices = [anchorIdx, ...anchorNeighbors].slice(0, 4);

      return allIndices.map(idx => {
        const pt = pts[idx];
        if (!pt) return null;
        const projected = state.renderer?.computeProjectedPoint?.(pt);
        if (!projected) return null;
        return { idx, screenX: projected.x, screenY: projected.y };
      }).filter(Boolean);
    });

    // Click near (but not on) neighborhood nodes, avoiding overlay centers
    for (const point of neighborhoodScreenPoints.slice(0, 3)) {
      // Offset the click position slightly to be near but not on the node
      const offsetX = 15;
      const offsetY = 15;
      const clickX = point.screenX + offsetX;
      const clickY = point.screenY + offsetY;

      // Skip if this click would land on an overlay center
      const onOverlay = centers.some(c =>
        Math.abs(c.x - clickX) < 30 && Math.abs(c.y - clickY) < 30
      );
      if (onOverlay) continue;

      await page.mouse.click(clickX, clickY);
      await page.waitForFunction(() => {
        const s = window.__APP_STATE__ ?? window.__TEST_STATE__;
        return s?.lastCanvasNodePick || s?.focusedNode !== null || s?.navState?.mode;
      }, { timeout: 5000 }).catch(() => {});
    }

    const after = await probe(page);
    expect(after.lastCanvasNodeFocusPick, 'clicking near neighborhood nodes should not create spurious canvas focus pick').toBeNull();
    expect(
      after.focusedNode === null || isValidNodeIndex(after.focusedNode, after.pointCount),
      'focusedNode must stay null or remain valid — no state corruption'
    ).toBe(true);
  });
});
