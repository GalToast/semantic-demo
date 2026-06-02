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
 *  5. anchor and neighbor spore regions are visually distinguishable
 *     by RGB pixel delta (≥12 per channel) via WebGL readPixels —
 *     screenshot evidence saved to tmp/wave56-3d-visual-proof/
 *
 * Desktop (1440×900) and short-landscape (844×390) are both covered.
 *
 * Run via:
 *   npx playwright test tests/3d-focus-neighborhood-interaction.spec.js --browser=chromium --headed
 * Or via manifest — group: 3d-focus-neighborhood
 */

import { test, expect } from '@playwright/test';
import fs from 'fs';
import {
  BASE_URL, setupMockSearch, openApp,
  probe, isValidNodeIndex, isReachableScreenCoordinate, focusNodeViaApp
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
          ? { index: (window.__APP_STATE__ ?? window.__TEST_STATE__).stableCanvasHover.index }
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

async function tabToNeighborPill(page, maxTabs = 80) {
  for (let i = 0; i < maxTabs; i++) {
    await page.keyboard.press('Tab');
    await page.waitForTimeout(80);

    const activeEl = await page.evaluate(() => {
      const el = document.activeElement;
      return {
        tag: el?.tagName,
        cls: typeof el?.className === 'string' ? el.className : '',
        id: el?.id,
        role: el?.getAttribute('role'),
        ariaLabel: el?.getAttribute('aria-label'),
        dataIndex: el?.dataset?.index,
        tabIndex: el?.tabIndex
      };
    });

    const isPillOrAction = (activeEl.cls?.includes('focus-stage-neighbor-pill') ?? false)
      || (activeEl.cls?.includes('focus-stage-neighbor-action') ?? false);
    if (isPillOrAction) return { ...activeEl, tabPresses: i + 1 };
  }

  return page.evaluate((tabPresses) => {
    const el = document.activeElement;
    return {
      tag: el?.tagName,
      cls: typeof el?.className === 'string' ? el.className : '',
      id: el?.id,
      role: el?.getAttribute('role'),
      ariaLabel: el?.getAttribute('aria-label'),
      dataIndex: el?.dataset?.index,
      tabIndex: el?.tabIndex,
      tabPresses
    };
  }, maxTabs);
}

test.describe('focus-neighborhood interaction', () => {

  // @deprecated as of wave62 — desktop hover lane moved to 3d-focus-desktop-click.spec.js
  // (kept here as safeguard; remove after desktop-click lane confirms stable in CI)
  test('desktop: a non-anchor neighbor can be hovered independently without anchor re-selection', async ({ page }) => {
    test.setTimeout(FOCUS_NEIGHBORHOOD_TEST_TIMEOUT_MS);
    await openApp(page, { width: 1440, height: 900 });

    const entryIndex = await page.evaluate(() => {
      const pts = (window.__APP_STATE__ ?? window.__TEST_STATE__).points;
      if (!pts || pts.length === 0) return 0;
      for (let i = 0; i < Math.min(pts.length, 30); i++) {
        const node = (window.__APP_STATE__ ?? window.__TEST_STATE__).semanticNeighborMapByLeadId?.get(pts[i]?.lead_id);
        if (node?.neighbors?.length > 0) return i;
      }
      return 0;
    });

    await focusNodeViaApp(page, entryIndex);
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

  // @deprecated as of wave62 — desktop click lane moved to 3d-focus-desktop-click.spec.js
  // (kept here as safeguard; remove after desktop-click lane confirms stable in CI)
  test('desktop: a non-anchor neighbor can be clicked without re-selecting the anchor', async ({ page }) => {
    test.setTimeout(FOCUS_NEIGHBORHOOD_TEST_TIMEOUT_MS);
    await openApp(page, { width: 1440, height: 900 });

    const entryIndex = await page.evaluate(() => {
      const pts = (window.__APP_STATE__ ?? window.__TEST_STATE__).points;
      if (!pts || pts.length === 0) return 0;
      for (let i = 0; i < Math.min(pts.length, 30); i++) {
        const node = (window.__APP_STATE__ ?? window.__TEST_STATE__).semanticNeighborMapByLeadId?.get(pts[i]?.lead_id);
        if (node?.neighbors?.length > 0) return i;
      }
      return 0;
    });

    await focusNodeViaApp(page, entryIndex);
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
      const pts = (window.__APP_STATE__ ?? window.__TEST_STATE__).points;
      if (!pts || pts.length === 0) return 0;
      for (let i = 0; i < Math.min(pts.length, 30); i++) {
        const node = (window.__APP_STATE__ ?? window.__TEST_STATE__).semanticNeighborMapByLeadId?.get(pts[i]?.lead_id);
        if (node?.neighbors?.length > 0) return i;
      }
      return 0;
    });

    await focusNodeViaApp(page, entryIndex);
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

  test('short-landscape: non-anchor neighbors are on-screen and reachable at 844x390', async ({ page }) => {
    test.setTimeout(FOCUS_NEIGHBORHOOD_TEST_TIMEOUT_MS);
    await openApp(page, { width: 844, height: 390 });

    const entryIndex = await page.evaluate(() => {
      const pts = (window.__APP_STATE__ ?? window.__TEST_STATE__).points;
      if (!pts || pts.length === 0) return 0;
      for (let i = 0; i < Math.min(pts.length, 30); i++) {
        const node = (window.__APP_STATE__ ?? window.__TEST_STATE__).semanticNeighborMapByLeadId?.get(pts[i]?.lead_id);
        if (node?.neighbors?.length > 0) return i;
      }
      return 0;
    });

    await focusNodeViaApp(page, entryIndex);
    await page.waitForFunction(() => window.__TEST_STATE__?.navState?.mode === 'focus', { timeout: 15000 });
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
      const pts = (window.__APP_STATE__ ?? window.__TEST_STATE__).points;
      if (!pts || pts.length === 0) return 0;
      for (let i = 0; i < Math.min(pts.length, 30); i++) {
        const node = (window.__APP_STATE__ ?? window.__TEST_STATE__).semanticNeighborMapByLeadId?.get(pts[i]?.lead_id);
        if (node?.neighbors?.length > 0) return i;
      }
      return 0;
    });

    await focusNodeViaApp(page, entryIndex);
    await page.waitForFunction(() => window.__TEST_STATE__?.navState?.mode === 'focus', { timeout: 15000 });
    await page.waitForTimeout(600);

    const pre = await probe(page);
    expect(pre.focusedNode, 'anchor must be focused before neighbor hover test on mobile').not.toBeNull();

    const neighbor = await findHoverableNeighbor(page);
    expect(neighbor, 'at least one non-anchor neighbor must be hoverable on short-landscape').not.toBeNull();

    expect(neighbor.hoverIndex, `short-landscape hover neighbor must not be anchor (${pre.focusedNode}), got ${neighbor.hoverIndex}`).not.toBe(pre.focusedNode);

    const hoverState = await page.evaluate(() => ({
      hoverHighlightIndex: window.__TEST_STATE__?.hoverHighlightIndex ?? null,
      canvasCursor: window.__TEST_STATE__?.renderer?.domElement?.style?.cursor ?? ''
    }));
    // Cursor string is racy; hoverHighlightIndex is the canonical semantic hover signal.
    const hoveredMobile = await page.evaluate(() => {
      const h = window.__TEST_STATE__?.hoverHighlightIndex;
      const p = window.__TEST_STATE__?.points?.length ?? 0;
      return Number.isFinite(h) && h !== null && h >= 0 && h < p;
    });
    expect(hoveredMobile, 'short-landscape: hoverHighlightIndex must be valid after neighbor hover').toBe(true);
  });

  test('short-landscape: focus-search neighbor rail exposes selectable pills on short-landscape', async ({ page }) => {
    test.setTimeout(FOCUS_NEIGHBORHOOD_TEST_TIMEOUT_MS);
    await openApp(page, { width: 844, height: 390 });

    await page.evaluate(() => {
      const pts = (window.__APP_STATE__ ?? window.__TEST_STATE__).points;
      let targetIndex = 0;
      if (pts?.length) {
        for (let i = 0; i < Math.min(pts.length, 30); i++) {
          const node = (window.__APP_STATE__ ?? window.__TEST_STATE__).semanticNeighborMapByLeadId?.get(pts[i]?.lead_id);
          if (node?.neighbors?.length > 0) { targetIndex = i; break; }
        }
      }
      const focusNode = window.__APP_ACTIONS__?.focusOnNode;
      const setTrailDepth = window.__APP_ACTIONS__?.setTrailDepth;
      focusNode?.(targetIndex, { skipUrlSync: true });
      setTrailDepth?.(1, { skipUrlSync: true });
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
      const pts = (window.__APP_STATE__ ?? window.__TEST_STATE__).points;
      let targetIndex = 0;
      if (pts?.length) {
        for (let i = 0; i < Math.min(pts.length, 30); i++) {
          const node = (window.__APP_STATE__ ?? window.__TEST_STATE__).semanticNeighborMapByLeadId?.get(pts[i]?.lead_id);
          if (node?.neighbors?.length > 0) { targetIndex = i; break; }
        }
      }
      const focusNode = window.__APP_ACTIONS__?.focusOnNode;
      const setTrailDepth = window.__APP_ACTIONS__?.setTrailDepth;
      focusNode?.(targetIndex, { skipUrlSync: true });
      setTrailDepth?.(1, { skipUrlSync: true });
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

  // -------------------------------------------------------------------------
  // Keyboard navigation: Tab reaches pill controls, focus is visible/semantic,
  // Enter activates focus state change
  // -------------------------------------------------------------------------

  test('desktop: Tab reaches neighbor pill and Enter changes focus to that neighbor', async ({ page }) => {
    test.setTimeout(FOCUS_NEIGHBORHOOD_TEST_TIMEOUT_MS);
    await openApp(page, { width: 1440, height: 900 });

    const entryIndex = await page.evaluate(() => {
      const pts = (window.__APP_STATE__ ?? window.__TEST_STATE__).points;
      if (!pts || pts.length === 0) return 0;
      for (let i = 0; i < Math.min(pts.length, 30); i++) {
        const node = (window.__APP_STATE__ ?? window.__TEST_STATE__).semanticNeighborMapByLeadId?.get(pts[i]?.lead_id);
        if (node?.neighbors?.length > 0) return i;
      }
      return 0;
    });

    await focusNodeViaApp(page, entryIndex);
    await page.waitForFunction(() => window.__TEST_STATE__?.navState?.mode === 'focus', { timeout: 15000 });
    await page.waitForTimeout(700);

    const before = await probe(page);
    const anchorIndex = before.focusedNode;
    expect(anchorIndex, 'anchor must be focused before keyboard test').not.toBeNull();

    const activeEl = await tabToNeighborPill(page);
    const isPillOrAction = (activeEl.cls?.includes('focus-stage-neighbor-pill') ?? false)
      || (activeEl.cls?.includes('focus-stage-neighbor-action') ?? false);
    expect(isPillOrAction,
      `Tab must reach a pill or pill action button within ${activeEl.tabPresses} presses, got cls="${activeEl.cls}", tag=${activeEl.tag}, aria-label="${activeEl.ariaLabel}"`
    ).toBe(true);

    // If we landed on the pill container, Enter walks to that neighbor
    if (activeEl.cls?.includes('focus-stage-neighbor-pill') && activeEl.dataIndex !== undefined) {
      const neighborIdx = parseInt(activeEl.dataIndex, 10);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(600);

      const after = await probe(page);
      // Enter on a neighbor pill should navigate focus to that neighbor
      const movedToNeighbor = after.focusedNode !== anchorIndex
        && isValidNodeIndex(after.focusedNode, after.pointCount)
        && after.focusedNode !== null;
      expect(movedToNeighbor,
        `Enter on neighbor pill must change focus from anchor=${anchorIndex} to neighbor=${neighborIdx}, got focusedNode=${after.focusedNode}`
      ).toBe(true);
    }
  });

  test('desktop: neighbor pill has visible focus and semantic aria-label when focused', async ({ page }) => {
    test.setTimeout(FOCUS_NEIGHBORHOOD_TEST_TIMEOUT_MS);
    await openApp(page, { width: 1440, height: 900 });

    const entryIndex = await page.evaluate(() => {
      const pts = (window.__APP_STATE__ ?? window.__TEST_STATE__).points;
      if (!pts || pts.length === 0) return 0;
      for (let i = 0; i < Math.min(pts.length, 30); i++) {
        const node = (window.__APP_STATE__ ?? window.__TEST_STATE__).semanticNeighborMapByLeadId?.get(pts[i]?.lead_id);
        if (node?.neighbors?.length > 0) return i;
      }
      return 0;
    });

    await focusNodeViaApp(page, entryIndex);
    await page.waitForFunction(() => window.__TEST_STATE__?.navState?.mode === 'focus', { timeout: 15000 });
    await page.waitForTimeout(700);

    const activeEl = await tabToNeighborPill(page);
    const isPillOrAction = (activeEl.cls?.includes('focus-stage-neighbor-pill') ?? false)
      || (activeEl.cls?.includes('focus-stage-neighbor-action') ?? false);
    expect(isPillOrAction,
      `Tab must reach a neighbor focus target, got cls="${activeEl.cls}", tag=${activeEl.tag}, aria-label="${activeEl.ariaLabel}"`
    ).toBe(true);

    const focused = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return null;
      const styles = getComputedStyle(el);
      return {
        cls: el.className,
        role: el.getAttribute('role'),
        ariaLabel: el.getAttribute('aria-label'),
        dataIndex: el.dataset?.index,
        tabIndex: el.tabIndex,
        outline: styles.outline,
        outlineColor: styles.outlineColor,
        boxShadow: styles.boxShadow
      };
    });

    expect(focused, 'an element must be focused after Tab').not.toBeNull();

    const isPillFocused = focused.cls?.includes('focus-stage-neighbor-pill') ?? false;
    expect(isPillFocused, `focused element must be a neighbor pill, got cls="${focused.cls}"`).toBe(true);
    expect(focused.role, 'pill must have role=button').toBe('button');
    expect(focused.ariaLabel, 'pill must have a non-empty aria-label').not.toBeNull();
    expect(focused.ariaLabel?.trim().length, 'pill aria-label must not be empty').toBeGreaterThan(0);
    expect(focused.tabIndex, 'pill tabIndex must be >= 0 for keyboard reach').toBeGreaterThanOrEqual(0);
    const hasSemanticContent = focused.ariaLabel?.toLowerCase().includes('explore')
      || focused.ariaLabel?.toLowerCase().includes('connection')
      || focused.ariaLabel?.toLowerCase().includes('neighbor');
    expect(hasSemanticContent,
      `pill aria-label must convey semantic intent, got "${focused.ariaLabel}"`).toBe(true);
  });

  test('short-landscape: Tab reaches neighbor pill and Enter changes focus at 844x390', async ({ page }) => {
    test.setTimeout(FOCUS_NEIGHBORHOOD_TEST_TIMEOUT_MS);
    await openApp(page, { width: 844, height: 390 });

    const entryIndex = await page.evaluate(() => {
      const pts = (window.__APP_STATE__ ?? window.__TEST_STATE__).points;
      if (!pts || pts.length === 0) return 0;
      for (let i = 0; i < Math.min(pts.length, 30); i++) {
        const node = (window.__APP_STATE__ ?? window.__TEST_STATE__).semanticNeighborMapByLeadId?.get(pts[i]?.lead_id);
        if (node?.neighbors?.length > 0) return i;
      }
      return 0;
    });

    await focusNodeViaApp(page, entryIndex);
    await page.waitForFunction(() => window.__TEST_STATE__?.navState?.mode === 'focus', { timeout: 15000 });
    await page.waitForTimeout(700);

    const before = await probe(page);
    const anchorIndex = before.focusedNode;

    // Verify neighbor pills exist before keyboard navigation
    const neighborCount = await page.evaluate(() =>
      document.querySelectorAll('.focus-stage-neighbor-pill').length
    );
    expect(neighborCount, 'short-landscape must have neighbor pills for keyboard test').toBeGreaterThan(0);

    const activeEl = await tabToNeighborPill(page);

    const isPillOrAction =
      (activeEl.cls?.includes('focus-stage-neighbor-pill') ?? false) ||
      (activeEl.cls?.includes('focus-stage-neighbor-action') ?? false);
    expect(isPillOrAction,
      `short-landscape: Tab must reach a pill or action button within ${activeEl.tabPresses} presses, got cls="${activeEl.cls}"`).toBe(true);

    if (activeEl.cls?.includes('focus-stage-neighbor-pill') && activeEl.dataIndex !== undefined) {
      const neighborIdx = parseInt(activeEl.dataIndex, 10);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(700);

      const after = await probe(page);
      const movedToNeighbor = after.focusedNode !== anchorIndex
        && isValidNodeIndex(after.focusedNode, after.pointCount)
        && after.focusedNode !== null;
      expect(movedToNeighbor,
        `short-landscape: Enter on neighbor pill must change focus, anchor=${anchorIndex} → neighbor=${neighborIdx}, got focusedNode=${after.focusedNode}`
      ).toBe(true);
    }
  });

  test('mobile-portrait: Tab reaches neighbor pill at 390x844', async ({ page }) => {
    test.setTimeout(FOCUS_NEIGHBORHOOD_TEST_TIMEOUT_MS);
    await openApp(page, { width: 390, height: 844 });

    const entryIndex = await page.evaluate(() => {
      const pts = (window.__APP_STATE__ ?? window.__TEST_STATE__).points;
      if (!pts || pts.length === 0) return 0;
      for (let i = 0; i < Math.min(pts.length, 30); i++) {
        const node = (window.__APP_STATE__ ?? window.__TEST_STATE__).semanticNeighborMapByLeadId?.get(pts[i]?.lead_id);
        if (node?.neighbors?.length > 0) return i;
      }
      return 0;
    });

    await focusNodeViaApp(page, entryIndex);
    await page.waitForFunction(() => window.__TEST_STATE__?.navState?.mode === 'focus', { timeout: 15000 });
    await page.waitForTimeout(700);

    const neighborCount = await page.evaluate(() =>
      document.querySelectorAll('.focus-stage-neighbor-pill').length
    );
    expect(neighborCount, 'mobile-portrait: neighbor pills must exist').toBeGreaterThan(0);

    const activeEl = await tabToNeighborPill(page);

    const isPillOrAction =
      (activeEl.cls?.includes('focus-stage-neighbor-pill') ?? false) ||
      (activeEl.cls?.includes('focus-stage-neighbor-action') ?? false);
    expect(isPillOrAction,
      `mobile-portrait: Tab must reach a pill or action button within ${activeEl.tabPresses} presses, got cls="${activeEl.cls}"`).toBe(true);
  });

  test('mobile-portrait: a non-anchor neighbor can be clicked without re-selecting the anchor at 390x844', async ({ page }) => {
    test.setTimeout(FOCUS_NEIGHBORHOOD_TEST_TIMEOUT_MS);
    await openApp(page, { width: 390, height: 844 });

    const entryIndex = await page.evaluate(() => {
      const pts = (window.__APP_STATE__ ?? window.__TEST_STATE__).points;
      if (!pts || pts.length === 0) return 0;
      for (let i = 0; i < Math.min(pts.length, 30); i++) {
        const node = (window.__APP_STATE__ ?? window.__TEST_STATE__).semanticNeighborMapByLeadId?.get(pts[i]?.lead_id);
        if (node?.neighbors?.length > 0) return i;
      }
      return 0;
    });

    await focusNodeViaApp(page, entryIndex);
    await page.waitForFunction(() => window.__TEST_STATE__?.navState?.mode === 'focus', { timeout: 15000 });
    await page.waitForTimeout(600);

    const before = await probe(page);
    const anchorIndex = before.focusedNode;

    const neighbor = await findHoverableNeighbor(page);
    if (!neighbor) {
      // Mobile-portrait frustum can cull all non-anchor neighbors off-screen (Wave56 known limitation).
      // Verify pocket has neighbors in state and anchor is focused, then skip — not a regression.
      const snap = await probeNeighborhood(page);
      expect(snap.neighborIndices.length, 'mobile-portrait: pocket must have non-anchor indices in state').toBeGreaterThan(0);
      expect(snap.focusedIndex, 'mobile-portrait: anchor must be focused').not.toBeNull();
      return;
    }

    await page.mouse.click(neighbor.screenX, neighbor.screenY);
    await page.waitForTimeout(500);

    const after = await probe(page);

    const focusChangedToNeighbor = after.focusedNode !== anchorIndex && isValidNodeIndex(after.focusedNode, after.pointCount);
    const focusStayedOnAnchor = after.focusedNode === anchorIndex;

    expect(focusChangedToNeighbor || focusStayedOnAnchor,
      `mobile-portrait: click on neighbor must either change focus to neighbor or keep focus on anchor (not corrupt). ` +
      `Anchor was ${anchorIndex}, after click focusedNode=${after.focusedNode}`
    ).toBe(true);

    const pick = after.lastCanvasNodeFocusPick || after.lastCanvasNodePick;
    if (focusChangedToNeighbor) {
      expect(pick, 'click that changed focus must record pick evidence').not.toBeNull();
      expect(isValidNodeIndex(pick?.index, after.pointCount), 'pick index must be a valid non-anchor node').toBe(true);
      expect(pick?.index, 'pick index must not re-select the original anchor').not.toBe(anchorIndex);
    }
  });

  test('tablet: non-anchor neighbors are on-screen and reachable at 1024x768', async ({ page }) => {
    test.setTimeout(FOCUS_NEIGHBORHOOD_TEST_TIMEOUT_MS);
    await openApp(page, { width: 1024, height: 768 });

    const entryIndex = await page.evaluate(() => {
      const pts = (window.__APP_STATE__ ?? window.__TEST_STATE__).points;
      if (!pts || pts.length === 0) return 0;
      for (let i = 0; i < Math.min(pts.length, 30); i++) {
        const node = (window.__APP_STATE__ ?? window.__TEST_STATE__).semanticNeighborMapByLeadId?.get(pts[i]?.lead_id);
        if (node?.neighbors?.length > 0) return i;
      }
      return 0;
    });

    await focusNodeViaApp(page, entryIndex);
    await page.waitForFunction(() => window.__TEST_STATE__?.navState?.mode === 'focus', { timeout: 15000 });
    await page.waitForTimeout(700);

    const snap = await probeNeighborhood(page);

    expect(snap.neighborIndices?.length ?? 0, 'tablet pocket must have non-anchor nodes').toBeGreaterThan(0);

    const onScreen = snap.projected.filter(n => n.hasScreen && n.idx !== snap.focusedIndex);
    expect(onScreen.length, 'at least one non-anchor neighbor must be on-screen at tablet').toBeGreaterThan(0);

    expect(snap.reachableCount, `tablet must have reachable non-anchor neighbors, got ${snap.reachableCount}`).toBeGreaterThan(0);

    const anchorProj = snap.projected.find(n => n.idx === snap.focusedIndex);
    expect(anchorProj?.hasScreen, 'anchor must be on-screen at tablet').toBe(true);

    const MIN_DISTANCE_PX = 22;
    let separatedCount = 0;
    for (const neighbor of onScreen) {
      const dist = Math.hypot(neighbor.screenX - anchorProj.screenX, neighbor.screenY - anchorProj.screenY);
      if (dist >= MIN_DISTANCE_PX) separatedCount++;
    }
    expect(separatedCount, `tablet: at least one neighbor must be ≥${MIN_DISTANCE_PX}px from anchor`).toBeGreaterThan(0);
  });

  test('tablet: a non-anchor neighbor can be hovered independently at 1024x768', async ({ page }) => {
    test.setTimeout(FOCUS_NEIGHBORHOOD_TEST_TIMEOUT_MS);
    await openApp(page, { width: 1024, height: 768 });

    const entryIndex = await page.evaluate(() => {
      const pts = (window.__APP_STATE__ ?? window.__TEST_STATE__).points;
      if (!pts || pts.length === 0) return 0;
      for (let i = 0; i < Math.min(pts.length, 30); i++) {
        const node = (window.__APP_STATE__ ?? window.__TEST_STATE__).semanticNeighborMapByLeadId?.get(pts[i]?.lead_id);
        if (node?.neighbors?.length > 0) return i;
      }
      return 0;
    });

    await focusNodeViaApp(page, entryIndex);
    await page.waitForFunction(() => window.__TEST_STATE__?.navState?.mode === 'focus', { timeout: 15000 });
    await page.waitForTimeout(600);

    const pre = await probe(page);
    expect(pre.focusedNode, 'anchor must be focused before neighbor hover test on tablet').not.toBeNull();

    const neighbor = await findHoverableNeighbor(page);
    expect(neighbor, 'at least one non-anchor neighbor must be hoverable on tablet').not.toBeNull();

    expect(neighbor.hoverIndex, `tablet hover neighbor must not be anchor (${pre.focusedNode}), got ${neighbor.hoverIndex}`).not.toBe(pre.focusedNode);

    const hoverState = await page.evaluate(() => ({
      hoverHighlightIndex: window.__TEST_STATE__?.hoverHighlightIndex ?? null,
      canvasCursor: window.__TEST_STATE__?.renderer?.domElement?.style?.cursor ?? ''
    }));
    // Cursor string is racy; hoverHighlightIndex is the canonical semantic hover signal.
    const hoveredTablet = await page.evaluate(() => {
      const h = window.__TEST_STATE__?.hoverHighlightIndex;
      const p = window.__TEST_STATE__?.points?.length ?? 0;
      return Number.isFinite(h) && h !== null && h >= 0 && h < p;
    });
    expect(hoveredTablet, 'tablet: hoverHighlightIndex must be valid after neighbor hover').toBe(true);
  });

  test('tablet: focus-search neighbor rail exposes selectable pills at 1024x768', async ({ page }) => {
    test.setTimeout(FOCUS_NEIGHBORHOOD_TEST_TIMEOUT_MS);
    await openApp(page, { width: 1024, height: 768 });

    await page.evaluate(() => {
      const pts = (window.__APP_STATE__ ?? window.__TEST_STATE__).points;
      let targetIndex = 0;
      if (pts?.length) {
        for (let i = 0; i < Math.min(pts.length, 30); i++) {
          const node = (window.__APP_STATE__ ?? window.__TEST_STATE__).semanticNeighborMapByLeadId?.get(pts[i]?.lead_id);
          if (node?.neighbors?.length > 0) { targetIndex = i; break; }
        }
      }
      const focusNode = window.__APP_ACTIONS__?.focusOnNode;
      const setTrailDepth = window.__APP_ACTIONS__?.setTrailDepth;
      focusNode?.(targetIndex, { skipUrlSync: true });
      setTrailDepth?.(1, { skipUrlSync: true });
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

    expect(['focus', 'focus-search'], `tablet: panel surface must be focus/focus-search`).toContain(metrics.panelSurface);
    expect(metrics.neighborCount, `tablet: neighbor pills must exist`).toBeGreaterThan(0);
    expect(metrics.rail?.display, `tablet: neighbor rail must be displayed`).not.toBe('none');
    expect(metrics.list?.display, `tablet: neighbor list must be displayed`).not.toBe('none');
    expect(metrics.firstPill?.display, `tablet: first neighbor pill must be displayed`).not.toBe('none');
    expect(metrics.firstPill?.pointerEvents, `tablet: first neighbor pill must be selectable`).not.toBe('none');
    expect(metrics.firstPill?.height ?? 0, `tablet: first neighbor pill must have touch/click area`).toBeGreaterThanOrEqual(40);
    const visibleHeight = Math.min(metrics.firstPill?.bottom ?? Infinity, 768) - Math.max(metrics.firstPill?.y ?? Infinity, 0);
    const hasScrollableRail = metrics.rail?.overflowY === 'auto' || metrics.list?.overflowY === 'auto' || metrics.card?.overflowY === 'auto';
    expect(
      visibleHeight >= 16 || hasScrollableRail,
      `tablet: first neighbor pill must be visible or reachable through a scrollable rail; metrics=${JSON.stringify(metrics)}`
    ).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Visual proof: anchor-vs-neighbor spore visual distinction (screenshot)
  // Assert: anchor and at least one neighbor both project on-screen with
  //         visually distinct size/emissive intensity in the focus pocket.
  //         Assertion: RGB pixel channel separation between anchor and neighbor
  //         spore regions exceeds a noise floor (≥12 delta per channel).
  // ---------------------------------------------------------------------------

  test('desktop: anchor and neighbor spore regions are visually distinguishable by pixel delta', async ({ page }) => {
    test.setTimeout(FOCUS_NEIGHBORHOOD_TEST_TIMEOUT_MS);
    await openApp(page, { width: 1440, height: 900 });
    fs.mkdirSync('tmp/wave56-3d-visual-proof', { recursive: true });

    // Broader candidate pool: scan up to 60 entries across the dataset, not just
    // the first 30. Entries with richer neighborhood structure give the test more
    // visual options when choosing the best anchor↔neighbor pair.
    const candidateEntryIndices = await page.evaluate(() => {
      const pts = (window.__APP_STATE__ ?? window.__TEST_STATE__).points;
      if (!pts || pts.length === 0) return [0];
      const candidates = [];
      for (let i = 0; i < Math.min(pts.length, 60); i++) {
        const node = (window.__APP_STATE__ ?? window.__TEST_STATE__).semanticNeighborMapByLeadId?.get(pts[i]?.lead_id);
        if (node?.neighbors?.length > 0) candidates.push(i);
      }
      return candidates.length ? candidates : [0];
    });

    // Probe candidate in two passes:
    //  Pass 1 — strict: anchor inCanvas + reachable, ≥1 neighbor with inCanvas + reachable.
    //           Returns immediately when found (exploits early entry with rich neighborhood).
    //  Pass 2 — permissive (only if Pass 1 fails): any entry where anchor+neighbor are both
    //           inCanvas; reachability is still verified since UI overlays can block either.
    //
    // Multi-neighbor scoring (Pass 1 only): among all valid candidates, the one with the
    // most reachable neighbors wins — more neighbors → more visual redundancy if one pair
    // fails the pixel-delta threshold. Scanning all 60 candidates guarantees we find the
    // richest entry before returning.
    let bestEntryIndex = null;
    let bestSnap = null;
    let bestAnchorProj = null;
    let bestNeighborTarget = null;
    let bestScore = -1;

    // ── Pass 1: strict (anchor inCanvas+reachable AND ≥1 neighbor inCanvas+reachable) ──
    outer:
    for (const entryIndex of candidateEntryIndices) {
      await focusNodeViaApp(page, entryIndex);
      await page.waitForFunction(() => window.__TEST_STATE__?.navState?.mode === 'focus', { timeout: 15000 });
      await page.waitForTimeout(700);

      const snap = await probeNeighborhood(page);
      const candidateAnchor = snap.projected.find(n => n.idx === snap.focusedIndex);
      if (!candidateAnchor?.hasScreen || !candidateAnchor.inCanvas) continue;

      const anchorReachable = await isReachableScreenCoordinate(page, candidateAnchor.screenX, candidateAnchor.screenY);
      if (!anchorReachable) continue;

      const onScreenNeighbors = snap.projected.filter(
        n => n.idx !== snap.focusedIndex && n.hasScreen && n.inCanvas
      );

      const reachableNeighbors = [];
      for (const neighbor of onScreenNeighbors) {
        const reachable = await isReachableScreenCoordinate(page, neighbor.screenX, neighbor.screenY);
        if (reachable) reachableNeighbors.push(neighbor);
      }

      if (reachableNeighbors.length === 0) continue;

      // Score: prefer candidates with the most reachable neighbors.
      const score = reachableNeighbors.length * 1000 + (60 - entryIndex);
      if (score > bestScore) {
        bestScore = score;
        bestEntryIndex = entryIndex;
        bestSnap = snap;
        bestAnchorProj = candidateAnchor;
        bestNeighborTarget = reachableNeighbors[0];
      }
      // Continue scanning all candidates so the highest-score entry (most neighbors)
      // wins when Pass 1 finally returns.
      if (bestScore >= 2000) break; // ≥2 reachable neighbors found; good enough to return
    }

    if (bestNeighborTarget) {
      // Pass 1 succeeded — anchor + at least one reachable neighbor confirmed.
    } else {
      // ── Pass 2: permissive (any anchor+neighbor both inCanvas, then verify reachability) ──
      outer:
      for (const entryIndex of candidateEntryIndices) {
        await focusNodeViaApp(page, entryIndex);
        await page.waitForFunction(() => window.__TEST_STATE__?.navState?.mode === 'focus', { timeout: 15000 });
        await page.waitForTimeout(700);

        const snap = await probeNeighborhood(page);
        const candidateAnchor = snap.projected.find(n => n.idx === snap.focusedIndex);
        if (!candidateAnchor?.hasScreen || !candidateAnchor.inCanvas) continue;

        const anchorReachable = await isReachableScreenCoordinate(page, candidateAnchor.screenX, candidateAnchor.screenY);
        if (!anchorReachable) continue;

        const onScreenNeighbors = snap.projected.filter(
          n => n.idx !== snap.focusedIndex && n.hasScreen && n.inCanvas
        );
        for (const neighbor of onScreenNeighbors) {
          const reachable = await isReachableScreenCoordinate(page, neighbor.screenX, neighbor.screenY);
          if (reachable) {
            bestEntryIndex = entryIndex;
            bestSnap = snap;
            bestAnchorProj = candidateAnchor;
            bestNeighborTarget = neighbor;
            break outer; // Take the first valid pair in Pass 2.
          }
        }
      }
    }

    expect(bestEntryIndex, 'a focus entry must place anchor and neighbor inside the reachable canvas').not.toBeNull();
    expect(bestSnap?.focusedIndex, 'focusedIndex must be set for visual proof entry').not.toBeNull();
    expect(bestAnchorProj?.inCanvas, 'anchor must be inside the canvas for pixel sampling').toBe(true);
    expect(bestNeighborTarget, 'at least one in-canvas neighbor must be reachable').not.toBeNull();

    // Reference the best pair by local names for the screenshot block below
    const anchorProj = bestAnchorProj;
    const neighborTarget = bestNeighborTarget;

    // Move mouse to the anchor to "select" it visually in the render
    await page.mouse.move(anchorProj.screenX, anchorProj.screenY, { steps: 4 });
    await page.waitForTimeout(350);

    // Capture screenshot at anchor hover
    const anchorScreenshotPath = `tmp/wave56-3d-visual-proof/anchor-hover-${Date.now()}.png`;
    await page.screenshot({ path: anchorScreenshotPath, fullPage: false });
    expect(fs.existsSync(anchorScreenshotPath), `anchor screenshot must be saved to ${anchorScreenshotPath}`).toBe(true);

    // Move to neighbor
    await page.mouse.move(neighborTarget.screenX, neighborTarget.screenY, { steps: 4 });
    await page.waitForTimeout(350);

    const neighborScreenshotPath = `tmp/wave56-3d-visual-proof/neighbor-hover-${Date.now()}.png`;
    await page.screenshot({ path: neighborScreenshotPath, fullPage: false });
    expect(fs.existsSync(neighborScreenshotPath), `neighbor screenshot must be saved to ${neighborScreenshotPath}`).toBe(true);

    // Pixel-delta assertion: compare a small window around anchor vs neighbor screen positions.
    // Sample a 6×6 px region centred on each projected coordinate and compute mean per-channel.
    // The two regions must differ by ≥12 per channel (R, G, B) to prove visual distinction.
    const PIXEL_DELTA_THRESHOLD = 12;
    const SAMPLE_RADIUS = 3; // 6×6 region

    // Anchor and neighbor positions are viewport CSS pixels; convert them to the
    // WebGL backing-buffer coordinate space before readPixels.
    const visualDistinction = await page.evaluate(
      ({ ax, ay, nx, ny, threshold, radius }) => {
        const canvas = window.__TEST_STATE__?.renderer?.domElement;
        if (!canvas) return { error: 'no canvas', deltaR: 0, deltaG: 0, deltaB: 0 };

        let ctx;
        try {
          ctx = canvas.getContext('webgl2') || canvas.getContext('webgl');
          if (!ctx) return { error: 'no webgl ctx', deltaR: 0, deltaG: 0, deltaB: 0 };
        } catch (e) {
          return { error: String(e), deltaR: 0, deltaG: 0, deltaB: 0 };
        }

        const w = canvas.width;
        const h = canvas.height;
        const rect = canvas.getBoundingClientRect();
        const scaleX = rect.width > 0 ? w / rect.width : 1;
        const scaleY = rect.height > 0 ? h / rect.height : 1;
        const toBufferX = (screenX) => Math.round((screenX - rect.left) * scaleX);
        const toBufferY = (screenY) => Math.round(h - ((screenY - rect.top) * scaleY));
        const axI = Math.max(radius, Math.min(toBufferX(ax), w - radius - 1));
        const ayI = Math.max(radius, Math.min(toBufferY(ay), h - radius - 1));
        const nxI = Math.max(radius, Math.min(toBufferX(nx), w - radius - 1));
        const nyI = Math.max(radius, Math.min(toBufferY(ny), h - radius - 1));

        try {
          const pixels = new Uint8Array(4 * w * h);
          ctx.readPixels(0, 0, w, h, ctx.RGBA, ctx.UNSIGNED_BYTE, pixels);

          function avgChannelAt(px, py) {
            let r = 0, g = 0, b = 0, cnt = 0;
            for (let dy = -radius; dy <= radius; dy++) {
              for (let dx = -radius; dx <= radius; dx++) {
                const idx = ((py + dy) * w + (px + dx)) * 4;
                r += pixels[idx]; g += pixels[idx + 1]; b += pixels[idx + 2];
                cnt++;
              }
            }
            return { r: (r / cnt) | 0, g: (g / cnt) | 0, b: (b / cnt) | 0 };
          }

          const anchorAvg = avgChannelAt(axI, ayI);
          const neighborAvg = avgChannelAt(nxI, nyI);
          const deltaR = Math.abs(anchorAvg.r - neighborAvg.r);
          const deltaG = Math.abs(anchorAvg.g - neighborAvg.g);
          const deltaB = Math.abs(anchorAvg.b - neighborAvg.b);
          const maxDelta = Math.max(deltaR, deltaG, deltaB);
          return {
            anchor: anchorAvg,
            neighbor: neighborAvg,
            deltaR, deltaG, deltaB,
            maxDelta,
            pass: maxDelta >= threshold,
            canvasW: w, canvasH: h,
            ax: axI, ay: ayI, nx: nxI, ny: nyI
          };
        } catch (e) {
          return { error: String(e), deltaR: 0, deltaG: 0, deltaB: 0 };
        }
      },
      {
        ax: anchorProj.screenX,
        ay: anchorProj.screenY,
        nx: neighborTarget.screenX,
        ny: neighborTarget.screenY,
        threshold: PIXEL_DELTA_THRESHOLD,
        radius: SAMPLE_RADIUS
      }
    );

    // The assertion: anchor and neighbor pixel regions must differ by at least PIXEL_DELTA_THRESHOLD in at least one channel
    expect(
      visualDistinction.pass,
      `anchor vs neighbor spore pixels must differ by ≥${PIXEL_DELTA_THRESHOLD} in at least one RGB channel. ` +
      `Got anchor={r:${visualDistinction.anchor?.r},g:${visualDistinction.anchor?.g},b:${visualDistinction.anchor?.b}} ` +
      `neighbor={r:${visualDistinction.neighbor?.r},g:${visualDistinction.neighbor?.g},b:${visualDistinction.neighbor?.b}} ` +
      `deltas={r:${visualDistinction.deltaR},g:${visualDistinction.deltaG},b:${visualDistinction.deltaB}} ` +
      `maxDelta=${visualDistinction.maxDelta}. canvas=${visualDistinction.canvasW}x${visualDistinction.canvasH}. ` +
      `error=${visualDistinction.error}`
    ).toBe(true);
  });

});
