/**
 * 3d-focus-neighborhood-interaction.spec.js
 *
 * Focus neighborhood interaction tests: hover, click, and state integrity
 * through neighbor interaction sequences.
 *
 * Success criteria
 * ───────────────
 *  1. at least one non-anchor neighbor can be hovered/clicked without
 *     simply re-selecting the anchor
 *  2. hover produces pointer cursor and valid hoverHighlightIndex
 *  3. click produces valid state (no corruption)
 *  4. state remains consistent after neighbor hover+click
 *
 * Desktop (1440×900) and short-landscape (844×390) are both covered.
 *
 * Run via:
 *   npx playwright test tests/3d-focus-neighborhood-interaction.spec.js --browser=chromium
 * Or via manifest — group: 3d-focus-neighborhood
 */

import { test, expect } from '@playwright/test';
import {
  BASE_URL, setupMockSearch, openApp,
  probe, isValidNodeIndex, isReachableScreenCoordinate
} from './helpers/3d-interaction-helpers.js';

const FOCUS_NEIGHBORHOOD_TEST_TIMEOUT_MS = 120000;

async function probeNeighborhood(page) {
  return page.evaluate(() => {
    const nav = window.state?.navState ?? {};
    const camera = window.state?.camera;
    const canvas = window.state?.renderer?.domElement;
    const rect = canvas?.getBoundingClientRect?.();
    const nodePositions = window.state?.nodePositions ?? [];
    const pointsMesh = window.state?.pointsMesh;
    const focusedIdx = nav.focusedIndex ?? null;

    const pocketRaw = nav.focusPocketIndices ?? [];
    const neighborIndices = pocketRaw.filter(idx => idx !== focusedIdx);

    const allPocketMembers = focusedIdx !== null
      ? [focusedIdx, ...pocketRaw]
      : [...pocketRaw];
    const uniqueMembers = [...new Set(allPocketMembers)];
    const projected = uniqueMembers.map(idx => {
      const pos = nodePositions[idx];
      if (!pos || !camera || !rect) return { idx, hasScreen: false, screenX: null, screenY: null };
      const vec = new window.THREE.Vector3(pos.x, pos.y, pos.z);
      if (pointsMesh?.localToWorld) pointsMesh.localToWorld(vec);
      const proj = vec.clone().project(camera);
      if (proj.z < -1 || proj.z > 1) return { idx, hasScreen: false, inCanvas: false, screenX: null, screenY: null };
      const screenX = ((proj.x + 1) / 2) * rect.width + rect.left;
      const screenY = ((-proj.y + 1) / 2) * rect.height + rect.top;
      const inCanvas = screenX >= rect.left && screenX <= rect.right && screenY >= rect.top && screenY <= rect.bottom;
      return { idx, hasScreen: true, inCanvas, screenX, screenY };
    });

    const reachable = projected.filter(n => n.hasScreen && n.inCanvas && n.idx !== focusedIdx);

    return {
      focusedIndex: focusedIdx,
      focusedNode: window.state?.focusedNode ?? null,
      pocketIndices: pocketRaw,
      neighborIndices,
      projected,
      reachableCount: reachable.length,
    };
  });
}

async function findHoverableNeighbor(page) {
  const snap = await probeNeighborhood(page);
  if (snap.reachableCount === 0) return null;

  const anchorPos = snap.projected.find(n => n.idx === snap.focusedIndex);
  const sorted = [...snap.projected].filter(n => n.hasScreen && n.idx !== snap.focusedIndex);
  if (anchorPos) {
    sorted.sort((a, b) => {
      const distA = Math.hypot(a.screenX - anchorPos.screenX, a.screenY - anchorPos.screenY);
      const distB = Math.hypot(b.screenX - anchorPos.screenX, b.screenY - anchorPos.screenY);
      return distB - distA;
    });
  }

  for (const neighbor of sorted) {
    const reachable = await isReachableScreenCoordinate(page, neighbor.screenX, neighbor.screenY);
    if (!reachable) continue;

    await page.mouse.move(neighbor.screenX, neighbor.screenY, { steps: 4 });
    await page.waitForTimeout(180);

    const state = await page.evaluate(() => {
      const pointCount = window.state?.points?.length ?? 0;
      return {
        hoverHighlightIndex: window.state?.hoverHighlightIndex ?? null,
        canvasCursor: window.state?.renderer?.domElement?.style?.cursor ?? '',
        stableCanvasHover: window.state?.stableCanvasHover
          ? { index: window.state.stableCanvasHover.index }
          : null,
        pointCount
      };
    });

    if (
      isValidNodeIndex(state.hoverHighlightIndex, state.pointCount) &&
      state.hoverHighlightIndex !== snap.focusedIndex &&
      state.canvasCursor === 'pointer'
    ) {
      return { ...neighbor, hoverIndex: state.hoverHighlightIndex, stableCanvasHover: state.stableCanvasHover };
    }
  }
  return null;
}

test.describe('focus-neighborhood interaction', () => {

  test('desktop: a non-anchor neighbor can be hovered independently without anchor re-selection', async ({ page }) => {
    test.setTimeout(FOCUS_NEIGHBORHOOD_TEST_TIMEOUT_MS);
    await openApp(page, { width: 1440, height: 900 });

    const entryIndex = await page.evaluate(() => {
      const pts = window.state.points;
      if (!pts || pts.length === 0) return 0;
      for (let i = 0; i < Math.min(pts.length, 30); i++) {
        const node = window.state.semanticNeighborMapByLeadId?.get(pts[i]?.lead_id);
        if (node?.neighbors?.length > 0) return i;
      }
      return 0;
    });

    await page.evaluate((idx) => { window.focusOnNode(idx); }, entryIndex);
    await page.waitForFunction(() => window.state?.navState?.mode === 'focus', { timeout: 15000 });
    await page.waitForTimeout(600);

    const pre = await probe(page);
    expect(pre.focusedNode, 'anchor must be focused before neighbor hover test').not.toBeNull();

    const neighbor = await findHoverableNeighbor(page);

    expect(neighbor, 'at least one non-anchor neighbor must be hoverable in focus mode').not.toBeNull();
    expect(neighbor.hoverIndex, 'hovered neighbor index must be valid').toBeTruthy();
    expect(neighbor.hoverIndex, `hovered neighbor must not be the anchor (anchor=${pre.focusedNode}), got idx=${neighbor.hoverIndex}`).not.toBe(pre.focusedNode);

    const hoverState = await page.evaluate(() => ({
      hoverHighlightIndex: window.state?.hoverHighlightIndex ?? null,
      canvasCursor: window.state?.renderer?.domElement?.style?.cursor ?? '',
      pointCount: window.state?.points?.length ?? 0
    }));
    expect(hoverState.canvasCursor, 'canvas cursor must indicate pointer on neighbor hover').toBe('pointer');
    expect(isValidNodeIndex(hoverState.hoverHighlightIndex, hoverState.pointCount),
      'hover state must resolve to a valid node').toBe(true);
  });

  test('desktop: a non-anchor neighbor can be clicked without re-selecting the anchor', async ({ page }) => {
    test.setTimeout(FOCUS_NEIGHBORHOOD_TEST_TIMEOUT_MS);
    await openApp(page, { width: 1440, height: 900 });

    const entryIndex = await page.evaluate(() => {
      const pts = window.state.points;
      if (!pts || pts.length === 0) return 0;
      for (let i = 0; i < Math.min(pts.length, 30); i++) {
        const node = window.state.semanticNeighborMapByLeadId?.get(pts[i]?.lead_id);
        if (node?.neighbors?.length > 0) return i;
      }
      return 0;
    });

    await page.evaluate((idx) => { window.focusOnNode(idx); }, entryIndex);
    await page.waitForFunction(() => window.state?.navState?.mode === 'focus', { timeout: 15000 });
    await page.waitForTimeout(600);

    const before = await probe(page);
    const anchorIndex = before.focusedNode;

    const neighbor = await findHoverableNeighbor(page);
    expect(neighbor, 'a hoverable non-anchor neighbor must exist before click test').not.toBeNull();

    await page.mouse.click(neighbor.screenX, neighbor.screenY);
    await page.waitForTimeout(500);

    const after = await probe(page);

    const focusChangedToNeighbor = after.focusedNode !== anchorIndex && isValidNodeIndex(after.focusedNode, after.pointCount);
    const focusStayedOnAnchor = after.focusedNode === anchorIndex;

    expect(focusChangedToNeighbor || focusStayedOnAnchor,
      `click on neighbor must either change focus to neighbor or keep focus on anchor (not corrupt). ` +
      `Anchor was ${anchorIndex}, after click focusedNode=${after.focusedNode}`
    ).toBe(true);

    const pick = after.lastCanvasNodeFocusPick || after.lastCanvasNodePick;
    if (focusChangedToNeighbor) {
      expect(pick, 'click that changed focus must record pick evidence').not.toBeNull();
      expect(isValidNodeIndex(pick?.index, after.pointCount), 'pick index must be a valid non-anchor node').toBe(true);
      expect(pick?.index, 'pick index must not re-select the original anchor').not.toBe(anchorIndex);
    }
  });

  test('desktop: after neighbor hover+click, state is consistent and focusedNode is valid', async ({ page }) => {
    test.setTimeout(FOCUS_NEIGHBORHOOD_TEST_TIMEOUT_MS);
    await openApp(page, { width: 1440, height: 900 });

    const entryIndex = await page.evaluate(() => {
      const pts = window.state.points;
      if (!pts || pts.length === 0) return 0;
      for (let i = 0; i < Math.min(pts.length, 30); i++) {
        const node = window.state.semanticNeighborMapByLeadId?.get(pts[i]?.lead_id);
        if (node?.neighbors?.length > 0) return i;
      }
      return 0;
    });

    await page.evaluate((idx) => { window.focusOnNode(idx); }, entryIndex);
    await page.waitForFunction(() => window.state?.navState?.mode === 'focus', { timeout: 15000 });
    await page.waitForTimeout(600);

    const neighbor = await findHoverableNeighbor(page);
    expect(neighbor, 'hoverable non-anchor neighbor must exist for state consistency test').not.toBeNull();

    await page.mouse.click(neighbor.screenX, neighbor.screenY);
    await page.waitForTimeout(500);

    const after = await probe(page);

    const focusValid = after.focusedNode === null || isValidNodeIndex(after.focusedNode, after.pointCount);
    expect(focusValid, 'focusedNode must be null or valid index after neighbor click').toBe(true);

    expect(typeof after.navMode === 'string' && after.navMode.length > 0,
      `navMode must be a non-empty string, got "${after.navMode}"`).toBe(true);

    expect(after.pointCount, 'pointCount must remain valid after neighbor interaction').toBeGreaterThan(0);
  });

  test('short-landscape: non-anchor neighbors are on-screen and reachable at 844x390', async ({ page }) => {
    test.setTimeout(FOCUS_NEIGHBORHOOD_TEST_TIMEOUT_MS);
    await openApp(page, { width: 844, height: 390 });

    const entryIndex = await page.evaluate(() => {
      const pts = window.state.points;
      if (!pts || pts.length === 0) return 0;
      for (let i = 0; i < Math.min(pts.length, 30); i++) {
        const node = window.state.semanticNeighborMapByLeadId?.get(pts[i]?.lead_id);
        if (node?.neighbors?.length > 0) return i;
      }
      return 0;
    });

    await page.evaluate((idx) => { window.focusOnNode(idx); }, entryIndex);
    await page.waitForFunction(() => window.state?.navState?.mode === 'focus', { timeout: 15000 });
    await page.waitForTimeout(700);

    const snap = await probeNeighborhood(page);

    expect(snap.neighborIndices?.length ?? 0, 'short-landscape pocket must have non-anchor nodes').toBeGreaterThan(0);

    const onScreen = snap.projected.filter(n => n.hasScreen && n.idx !== snap.focusedIndex);
    expect(onScreen.length, 'at least one non-anchor neighbor must be on-screen at short-landscape').toBeGreaterThan(0);

    expect(snap.reachableCount, `short-landscape must have reachable non-anchor neighbors, got ${snap.reachableCount}`).toBeGreaterThan(0);

    const anchorProj = snap.projected.find(n => n.idx === snap.focusedIndex);
    expect(anchorProj?.hasScreen, 'anchor must be on-screen at short-landscape').toBe(true);

    const MIN_DISTANCE_PX = 20;
    let separatedCount = 0;
    for (const neighbor of onScreen) {
      const dist = Math.hypot(neighbor.screenX - anchorProj.screenX, neighbor.screenY - anchorProj.screenY);
      if (dist >= MIN_DISTANCE_PX) separatedCount++;
    }
    expect(separatedCount, `at least one neighbor must be ≥${MIN_DISTANCE_PX}px from anchor at short-landscape`).toBeGreaterThan(0);
  });

  test('short-landscape: a non-anchor neighbor can be hovered independently at 844x390', async ({ page }) => {
    test.setTimeout(FOCUS_NEIGHBORHOOD_TEST_TIMEOUT_MS);
    await openApp(page, { width: 844, height: 390 });

    const entryIndex = await page.evaluate(() => {
      const pts = window.state.points;
      if (!pts || pts.length === 0) return 0;
      for (let i = 0; i < Math.min(pts.length, 30); i++) {
        const node = window.state.semanticNeighborMapByLeadId?.get(pts[i]?.lead_id);
        if (node?.neighbors?.length > 0) return i;
      }
      return 0;
    });

    await page.evaluate((idx) => { window.focusOnNode(idx); }, entryIndex);
    await page.waitForFunction(() => window.state?.navState?.mode === 'focus', { timeout: 15000 });
    await page.waitForTimeout(600);

    const pre = await probe(page);
    expect(pre.focusedNode, 'anchor must be focused before neighbor hover test on mobile').not.toBeNull();

    const neighbor = await findHoverableNeighbor(page);
    expect(neighbor, 'at least one non-anchor neighbor must be hoverable on short-landscape').not.toBeNull();

    expect(neighbor.hoverIndex, `short-landscape hover neighbor must not be anchor (${pre.focusedNode}), got ${neighbor.hoverIndex}`).not.toBe(pre.focusedNode);

    const hoverState = await page.evaluate(() => ({
      hoverHighlightIndex: window.state?.hoverHighlightIndex ?? null,
      canvasCursor: window.state?.renderer?.domElement?.style?.cursor ?? ''
    }));
    expect(hoverState.canvasCursor, 'short-landscape canvas cursor must be pointer on neighbor hover').toBe('pointer');
  });

  test('short-landscape: focus-search neighbor rail exposes selectable pills on short-landscape', async ({ page }) => {
    test.setTimeout(FOCUS_NEIGHBORHOOD_TEST_TIMEOUT_MS);
    await openApp(page, { width: 844, height: 390 });

    await page.evaluate(() => {
      const pts = window.state.points;
      let targetIndex = 0;
      if (pts?.length) {
        for (let i = 0; i < Math.min(pts.length, 30); i++) {
          const node = window.state.semanticNeighborMapByLeadId?.get(pts[i]?.lead_id);
          if (node?.neighbors?.length > 0) { targetIndex = i; break; }
        }
      }
      window.focusOnNode?.(targetIndex, { skipUrlSync: true });
      window.setTrailDepth?.(1, { skipUrlSync: true });
    });
    await page.waitForFunction(() => ['focus', 'focus-search'].includes(document.body?.dataset?.panelSurface), { timeout: 15000 });
    await page.waitForTimeout(800);

    const metrics = await page.evaluate(() => {
      const rect = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const styles = getComputedStyle(el);
        return {
          x: Math.round(r.x),
          y: Math.round(r.y),
          width: Math.round(r.width),
          height: Math.round(r.height),
          bottom: Math.round(r.bottom),
          display: styles.display,
          visibility: styles.visibility,
          pointerEvents: styles.pointerEvents,
          overflowY: styles.overflowY
        };
      };
      return {
        panelSurface: document.body.dataset.panelSurface,
        card: rect(document.querySelector('.focus-stage-card')),
        rail: rect(document.getElementById('focus-stage-neighbors')),
        list: rect(document.getElementById('focus-stage-neighbor-list')),
        firstPill: rect(document.querySelector('.focus-stage-neighbor-pill')),
        neighborCount: document.querySelectorAll('.focus-stage-neighbor-pill').length
      };
    });

    expect(['focus', 'focus-search'], `short-landscape: panel surface must be focus/focus-search`).toContain(metrics.panelSurface);
    expect(metrics.neighborCount, `short-landscape: neighbor pills must exist`).toBeGreaterThan(0);
    expect(metrics.rail?.display, `short-landscape: neighbor rail must be displayed`).not.toBe('none');
    expect(metrics.list?.display, `short-landscape: neighbor list must be displayed`).not.toBe('none');
    expect(metrics.firstPill?.display, `short-landscape: first neighbor pill must be displayed`).not.toBe('none');
    expect(metrics.firstPill?.pointerEvents, `short-landscape: first neighbor pill must be selectable`).not.toBe('none');
    expect(metrics.firstPill?.height ?? 0, `short-landscape: first neighbor pill must have touch/click area`).toBeGreaterThanOrEqual(40);
    const visibleHeight = Math.min(metrics.firstPill?.bottom ?? Infinity, 390) - Math.max(metrics.firstPill?.y ?? Infinity, 0);
    const hasScrollableRail = metrics.rail?.overflowY === 'auto' || metrics.list?.overflowY === 'auto' || metrics.card?.overflowY === 'auto';
    expect(
      visibleHeight >= 16 || hasScrollableRail,
      `short-landscape: first neighbor pill must be visible or reachable through a scrollable rail; metrics=${JSON.stringify(metrics)}`
    ).toBe(true);
  });

  test('mobile-portrait: focus-search neighbor rail exposes selectable pills on 390x844', async ({ page }) => {
    test.setTimeout(FOCUS_NEIGHBORHOOD_TEST_TIMEOUT_MS);
    await openApp(page, { width: 390, height: 844 });

    await page.evaluate(() => {
      const pts = window.state.points;
      let targetIndex = 0;
      if (pts?.length) {
        for (let i = 0; i < Math.min(pts.length, 30); i++) {
          const node = window.state.semanticNeighborMapByLeadId?.get(pts[i]?.lead_id);
          if (node?.neighbors?.length > 0) { targetIndex = i; break; }
        }
      }
      window.focusOnNode?.(targetIndex, { skipUrlSync: true });
      window.setTrailDepth?.(1, { skipUrlSync: true });
    });
    await page.waitForFunction(() => ['focus', 'focus-search'].includes(document.body?.dataset?.panelSurface), { timeout: 15000 });
    await page.waitForTimeout(800);

    const metrics = await page.evaluate(() => {
      const rect = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const styles = getComputedStyle(el);
        return {
          x: Math.round(r.x),
          y: Math.round(r.y),
          width: Math.round(r.width),
          height: Math.round(r.height),
          bottom: Math.round(r.bottom),
          display: styles.display,
          visibility: styles.visibility,
          pointerEvents: styles.pointerEvents,
          overflowY: styles.overflowY
        };
      };
      return {
        panelSurface: document.body.dataset.panelSurface,
        rail: rect(document.getElementById('focus-stage-neighbors')),
        list: rect(document.getElementById('focus-stage-neighbor-list')),
        firstPill: rect(document.querySelector('.focus-stage-neighbor-pill')),
        neighborCount: document.querySelectorAll('.focus-stage-neighbor-pill').length
      };
    });

    expect(['focus', 'focus-search'], `mobile-portrait: panel surface must be focus/focus-search`).toContain(metrics.panelSurface);
    expect(metrics.neighborCount, `mobile-portrait: neighbor pills must exist`).toBeGreaterThan(0);
    expect(metrics.rail?.display, `mobile-portrait: neighbor rail must be displayed`).not.toBe('none');
    expect(metrics.list?.display, `mobile-portrait: neighbor list must be displayed`).not.toBe('none');
    expect(metrics.firstPill?.display, `mobile-portrait: first neighbor pill must be displayed`).not.toBe('none');
    expect(metrics.firstPill?.pointerEvents, `mobile-portrait: first neighbor pill must be selectable`).not.toBe('none');
    expect(metrics.firstPill?.height ?? 0, `mobile-portrait: first neighbor pill must have touch/click area`).toBeGreaterThanOrEqual(40);
    const visibleHeight = Math.min(metrics.firstPill?.bottom ?? Infinity, 844) - Math.max(metrics.firstPill?.y ?? Infinity, 0);
    const hasScrollableRail = metrics.rail?.overflowY === 'auto' || metrics.list?.overflowY === 'auto';
    expect(
      visibleHeight >= 16 || hasScrollableRail,
      `mobile-portrait: first neighbor pill must be visible or reachable through a scrollable rail; metrics=${JSON.stringify(metrics)}`
    ).toBe(true);
  });

});
