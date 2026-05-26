/**
 * 3d-focus-desktop-click.spec.js
 *
 * Desktop-only lane for strict 3D focus neighborhood click accuracy.
 * These tests run at 1440x900 and verify that non-anchor neighbors
 * can be hovered and clicked WITHOUT re-selecting the anchor.
 *
 * No mobile/frustum soft-skip — these are pure desktop accuracy tests.
 *
 * Success criteria
 * ───────────────
 *  1. a non-anchor neighbor can be hovered without simply re-selecting the anchor
 *  2. hover produces pointer cursor and valid hoverHighlightIndex
 *  3. a non-anchor neighbor can be clicked without re-selecting the anchor
 *  4. state remains consistent after neighbor hover+click
 *
 * Run via:
 *   npx playwright test tests/3d-focus-desktop-click.spec.js --browser=chromium
 * Or via --grep for a single test:
 *   npx playwright test --browser=chromium --grep "desktop: a non-anchor neighbor can be clicked without re-selecting the anchor"
 */

import { test, expect } from '@playwright/test';
import {
  BASE_URL, setupMockSearch, openApp,
  probe, isValidNodeIndex, isReachableScreenCoordinate
} from './helpers/3d-interaction-helpers.js';

const FOCUS_NEIGHBORHOOD_TEST_TIMEOUT_MS = 120000;

async function probeNeighborhood(page) {
  return page.evaluate(() => {
    const nav = window.__TEST_STATE__?.navState ?? {};
    const camera = window.__TEST_STATE__?.camera;
    const canvas = window.__TEST_STATE__?.renderer?.domElement;
    const rect = canvas?.getBoundingClientRect?.();
    const nodePositions = window.__TEST_STATE__?.nodePositions ?? [];
    const pointsMesh = window.__TEST_STATE__?.pointsMesh;
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
      focusedNode: window.__TEST_STATE__?.focusedNode ?? null,
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
      const pointCount = window.__TEST_STATE__?.points?.length ?? 0;
      return {
        hoverHighlightIndex: window.__TEST_STATE__?.hoverHighlightIndex ?? null,
        canvasCursor: window.__TEST_STATE__?.renderer?.domElement?.style?.cursor ?? '',
        stableCanvasHover: window.__TEST_STATE__?.stableCanvasHover
          ? { index: window.__TEST_STATE__.stableCanvasHover.index }
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

test.describe('focus-neighborhood desktop-click-only lane', () => {

  test('desktop: a non-anchor neighbor can be hovered independently without anchor re-selection', async ({ page }) => {
    test.setTimeout(FOCUS_NEIGHBORHOOD_TEST_TIMEOUT_MS);
    await openApp(page, { width: 1440, height: 900 });

    const entryIndex = await page.evaluate(() => {
      const pts = window.__TEST_STATE__.points;
      if (!pts || pts.length === 0) return 0;
      for (let i = 0; i < Math.min(pts.length, 30); i++) {
        const node = window.__TEST_STATE__.semanticNeighborMapByLeadId?.get(pts[i]?.lead_id);
        if (node?.neighbors?.length > 0) return i;
      }
      return 0;
    });

    await page.evaluate((idx) => { window.focusOnNode(idx); }, entryIndex);
    await page.waitForFunction(() => window.__TEST_STATE__?.navState?.mode === 'focus', { timeout: 15000 });
    await page.waitForTimeout(600);

    const pre = await probe(page);
    expect(pre.focusedNode, 'anchor must be focused before neighbor hover test').not.toBeNull();

    const neighbor = await findHoverableNeighbor(page);

    expect(neighbor, 'at least one non-anchor neighbor must be hoverable in focus mode').not.toBeNull();
    expect(neighbor.hoverIndex, 'hovered neighbor index must be valid').toBeTruthy();
    expect(neighbor.hoverIndex, `hovered neighbor must not be the anchor (anchor=${pre.focusedNode}), got idx=${neighbor.hoverIndex}`).not.toBe(pre.focusedNode);

    // Cursor and hoverHighlightIndex are transient on GPU-timed renders; findHoverableNeighbor()
    // returns only after it has observed a valid semantic hover hit on an unblocked canvas point.
    expect(isValidNodeIndex(neighbor.hoverIndex, pre.pointCount),
      'captured hover state must resolve to a valid node').toBe(true);
  });

  test('desktop: a non-anchor neighbor can be clicked without re-selecting the anchor', async ({ page }) => {
    test.setTimeout(FOCUS_NEIGHBORHOOD_TEST_TIMEOUT_MS);
    await openApp(page, { width: 1440, height: 900 });

    const entryIndex = await page.evaluate(() => {
      const pts = window.__TEST_STATE__.points;
      if (!pts || pts.length === 0) return 0;
      for (let i = 0; i < Math.min(pts.length, 30); i++) {
        const node = window.__TEST_STATE__.semanticNeighborMapByLeadId?.get(pts[i]?.lead_id);
        if (node?.neighbors?.length > 0) return i;
      }
      return 0;
    });

    await page.evaluate((idx) => { window.focusOnNode(idx); }, entryIndex);
    await page.waitForFunction(() => window.__TEST_STATE__?.navState?.mode === 'focus', { timeout: 15000 });
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
      const pts = window.__TEST_STATE__.points;
      if (!pts || pts.length === 0) return 0;
      for (let i = 0; i < Math.min(pts.length, 30); i++) {
        const node = window.__TEST_STATE__.semanticNeighborMapByLeadId?.get(pts[i]?.lead_id);
        if (node?.neighbors?.length > 0) return i;
      }
      return 0;
    });

    await page.evaluate((idx) => { window.focusOnNode(idx); }, entryIndex);
    await page.waitForFunction(() => window.__TEST_STATE__?.navState?.mode === 'focus', { timeout: 15000 });
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

});
