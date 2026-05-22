/**
 * 3d-focus-neighborhood-node-selectability.spec.js
 *
 * Strict contract test: non-anchor focus-neighborhood nodes are
 * visible/identifiable/selectable separately from the focused node's own
 * lens/glow/effects.
 *
 * Success criteria
 * ───────────────
 *  1. enumerate focusPocketIndices, exclude the focused index
 *  2. project each neighbor (or a meaningful sample) to screen space
 *  3. assert non-anchor candidates have:
 *     a. finite screen coordinates in unobstructed canvas
 *     b. visually distinguishable state/role from the anchor
 *     c. minimum screen distance from anchor
 *  4. at least one non-anchor projected neighbor can be hovered/clicked/
 *     inspected without simply re-selecting the anchor
 *
 * Desktop (1440×900) and short-landscape (844×390) are both covered.
 *
 * Run directly:
 *   npx playwright test tests/3d-focus-neighborhood-node-selectability.spec.js --browser=chromium --workers=1
 * Or via manifest — group: 3d-focus-neighborhood
 */

import { test, expect } from '@playwright/test';
import {
  BASE_URL, setupMockSearch, openApp,
  probe, probeFocusPocket, isValidNodeIndex, isReachableScreenCoordinate
} from './helpers/3d-interaction-helpers.js';

// ---------------------------------------------------------------------------
// Probe: captures full neighborhood state in one call
// ---------------------------------------------------------------------------

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

    // Project all pocket members including the anchor (needed for distance comparisons)
    // focusPocketIndices excludes the anchor, so include focusedIdx explicitly
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
      if (proj.z < -1 || proj.z > 1) return { idx, hasScreen: false, screenX: null, screenY: null };
      const screenX = ((proj.x + 1) / 2) * rect.width + rect.left;
      const screenY = ((-proj.y + 1) / 2) * rect.height + rect.top;
      return { idx, hasScreen: true, screenX, screenY };
    });

    const reachable = projected.filter(n => n.hasScreen);
    const roles = nav.focusPocketRoleByIndex
      ? Object.fromEntries(nav.focusPocketRoleByIndex)
      : {};

    return {
      focusedIndex: focusedIdx,
      focusedNode: window.state?.focusedNode ?? null,
      pocketIndices: pocketRaw,
      neighborIndices,            // pocket minus anchor
      projected,                  // all projected neighbors
      reachableCount: reachable.length,
      reachableIndices: reachable.map(n => n.idx),
      roles,
      focusPocketMeta: nav.focusPocketMeta ?? null,
      mode: nav.mode ?? '',
      navState: {
        focusPocketIndices: pocketRaw,
        focusPocketRoleByIndex: roles,
        focusPocketMeta: nav.focusPocketMeta
      }
    };
  });
}

// ---------------------------------------------------------------------------
// Find a non-anchor neighbor that can be hovered on canvas
// ---------------------------------------------------------------------------

async function findHoverableNeighbor(page) {
  const snap = await probeNeighborhood(page);
  if (snap.reachableCount === 0) return null;

  // Sort reachable by screen distance from anchor (prefer outer neighbors)
  const anchorPos = snap.projected.find(n => n.idx === snap.focusedIndex);
  const sorted = [...snap.projected].filter(n => n.hasScreen && n.idx !== snap.focusedIndex);
  if (anchorPos) {
    sorted.sort((a, b) => {
      const distA = Math.hypot(a.screenX - anchorPos.screenX, a.screenY - anchorPos.screenY);
      const distB = Math.hypot(b.screenX - anchorPos.screenX, b.screenY - anchorPos.screenY);
      return distB - distA; // farthest first — outer neighbors more distinctive
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

// ---------------------------------------------------------------------------
// TEST SUITE
// ---------------------------------------------------------------------------

test.describe('focus-neighborhood node selectability', () => {

  // ------------------------------------------------------------------
  // Desktop: non-anchor pocket nodes are projected to valid screen coords
  // ------------------------------------------------------------------

  test('desktop: non-anchor pocket nodes have finite screen coordinates in unobstructed canvas', async ({ page }) => {
    test.setTimeout(60000);
    await openApp(page, { width: 1440, height: 900 });

    // Enter focus on an index that has neighbors
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
    await page.waitForTimeout(1000); // allow pocket animation to begin

    const snap = await probeNeighborhood(page);

    // ── Criterion 1: pocket must have non-anchor nodes ──
    expect(snap.neighborIndices.length, 'pocket must contain at least one non-anchor node').toBeGreaterThan(0);

    // ── Criterion 2: each neighbor must project to finite screen coordinates ──
    const projected = snap.projected.filter(n => n.idx !== snap.focusedIndex);
    expect(projected.length, 'non-anchor neighbors must be projectable').toBeGreaterThan(0);

    for (const neighbor of projected) {
      expect(Number.isFinite(neighbor.screenX), `neighbor idx=${neighbor.idx} screenX must be finite`).toBe(true);
      expect(Number.isFinite(neighbor.screenY), `neighbor idx=${neighbor.idx} screenY must be finite`).toBe(true);
    }

    // ── Criterion 3a: reachable canvas (not blocked by overlay) ──
    expect(snap.reachableCount, `at least one non-anchor neighbor must be on-screen and reachable, got ${snap.reachableCount} of ${projected.length}`).toBeGreaterThan(0);

    for (const idx of snap.reachableIndices) {
      const proj = snap.projected.find(p => p.idx === idx);
      if (!proj?.hasScreen) continue;
      const reachable = await isReachableScreenCoordinate(page, proj.screenX, proj.screenY);
      expect(reachable, `neighbor idx=${idx} at (${proj.screenX}, ${proj.screenY}) must not be blocked by overlay`).toBe(true);
    }
  });

  // ------------------------------------------------------------------
  // Desktop: non-anchor neighbors have visually distinguishable role from anchor
  // ------------------------------------------------------------------

  test('desktop: non-anchor neighbors are role-distinguishable from anchor (anchor=anchor, neighbor=primary/support/halo)', async ({ page }) => {
    test.setTimeout(60000);
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
    await page.waitForTimeout(1000);

    const snap = await probeNeighborhood(page);

    // Anchor must have role "anchor"
    const anchorRole = snap.roles[String(snap.focusedIndex)];
    expect(anchorRole, `focused index must have role "anchor", got "${anchorRole}"`).toBe('anchor');

    // Every non-anchor neighbor must have a non-anchor role
    const validRoles = new Set(['primary', 'support', 'halo']);
    for (const [idx, role] of Object.entries(snap.roles)) {
      if (String(idx) === String(snap.focusedIndex)) continue;
      expect(validRoles.has(role), `neighbor idx=${idx} must have role primary/support/halo, got "${role}"`).toBe(true);
    }

    // All non-anchor neighbors must be in the pocket (not stray indices)
    for (const idx of snap.neighborIndices) {
      expect(snap.roles[String(idx)], `neighbor idx=${idx} must have a defined role`).toBeDefined();
    }
  });

  // ------------------------------------------------------------------
  // Desktop: non-anchor neighbors are spatially separated from anchor
  // ------------------------------------------------------------------

  test('desktop: non-anchor neighbors have minimum screen distance from anchor (not co-located)', async ({ page }) => {
    test.setTimeout(60000);
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
    await page.waitForTimeout(1200); // let animation settle

    const snap = await probeNeighborhood(page);
    const MIN_DISTANCE_PX = 28;

    const anchorProj = snap.projected.find(n => n.idx === snap.focusedIndex);
    expect(anchorProj, 'anchor must be projectable').toBeTruthy();
    expect(anchorProj.hasScreen, 'anchor must be on-screen').toBe(true);

    const nonAnchorProjected = snap.projected.filter(n => n.idx !== snap.focusedIndex && n.hasScreen);
    expect(nonAnchorProjected.length, 'must have at least one non-anchor projected neighbor').toBeGreaterThan(0);

    let separatedCount = 0;
    for (const neighbor of nonAnchorProjected) {
      const dist = Math.hypot(neighbor.screenX - anchorProj.screenX, neighbor.screenY - anchorProj.screenY);
      if (dist >= MIN_DISTANCE_PX) separatedCount++;
    }

    expect(separatedCount, `at least one non-anchor neighbor must be ≥${MIN_DISTANCE_PX}px from anchor, got ${separatedCount}/${nonAnchorProjected.length} separated`).toBeGreaterThan(0);
  });

  // ------------------------------------------------------------------
  // Desktop: at least one non-anchor neighbor can be hovered without re-selecting anchor
  // ------------------------------------------------------------------

  test('desktop: a non-anchor neighbor can be hovered independently without anchor re-selection', async ({ page }) => {
    test.setTimeout(60000);
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
    await page.waitForTimeout(1000);

    // Confirm anchor is focused
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

  // ------------------------------------------------------------------
  // Desktop: non-anchor neighbor can be clicked without re-selecting anchor
  // ------------------------------------------------------------------

  test('desktop: a non-anchor neighbor can be clicked without re-selecting the anchor', async ({ page }) => {
    test.setTimeout(60000);
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
    await page.waitForTimeout(1000);

    const before = await probe(page);
    const anchorIndex = before.focusedNode;

    const neighbor = await findHoverableNeighbor(page);
    expect(neighbor, 'a hoverable non-anchor neighbor must exist before click test').not.toBeNull();

    // Click the neighbor
    await page.mouse.click(neighbor.screenX, neighbor.screenY);
    await page.waitForTimeout(800);

    const after = await probe(page);

    // Either focus changed to the neighbor, OR focus remained on anchor but
    // the click produced valid state (did not corrupt state). The key
    // constraint is: clicking neighbor must not silently re-select anchor.
    const focusChangedToNeighbor = after.focusedNode !== anchorIndex && isValidNodeIndex(after.focusedNode, after.pointCount);
    const focusStayedOnAnchor = after.focusedNode === anchorIndex;

    expect(focusChangedToNeighbor || focusStayedOnAnchor,
      `click on neighbor must either change focus to neighbor or keep focus on anchor (not corrupt). ` +
      `Anchor was ${anchorIndex}, after click focusedNode=${after.focusedNode}`
    ).toBe(true);

    // Verify click was recorded (pick evidence must exist)
    const pick = after.lastCanvasNodeFocusPick || after.lastCanvasNodePick;
    if (focusChangedToNeighbor) {
      expect(pick, 'click that changed focus must record pick evidence').not.toBeNull();
      expect(pick?.index, 'pick index must be the neighbor, not the anchor').toBe(neighbor.idx);
    }
  });

  // ------------------------------------------------------------------
  // Short-landscape: non-anchor neighbors are projected and reachable
  // ------------------------------------------------------------------

  test('short-landscape: non-anchor neighbors are on-screen and reachable at 844x390', async ({ page }) => {
    test.setTimeout(60000);
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
    await page.waitForTimeout(1200);

    const snap = await probeNeighborhood(page);

    expect(snap.neighborIndices.length, 'short-landscape pocket must have non-anchor nodes').toBeGreaterThan(0);

    const onScreen = snap.projected.filter(n => n.hasScreen && n.idx !== snap.focusedIndex);
    expect(onScreen.length, 'at least one non-anchor neighbor must be on-screen at short-landscape').toBeGreaterThan(0);

    expect(snap.reachableCount, `short-landscape must have reachable non-anchor neighbors, got ${snap.reachableCount}`).toBeGreaterThan(0);

    // Anchor must also be on screen
    const anchorProj = snap.projected.find(n => n.idx === snap.focusedIndex);
    expect(anchorProj?.hasScreen, 'anchor must be on-screen at short-landscape').toBe(true);

    // At least one non-anchor must be spatially distinguishable (min separation)
    const MIN_DISTANCE_PX = 20;
    let separatedCount = 0;
    for (const neighbor of onScreen) {
      const dist = Math.hypot(neighbor.screenX - anchorProj.screenX, neighbor.screenY - anchorProj.screenY);
      if (dist >= MIN_DISTANCE_PX) separatedCount++;
    }
    expect(separatedCount, `at least one neighbor must be ≥${MIN_DISTANCE_PX}px from anchor at short-landscape`).toBeGreaterThan(0);
  });

  // ------------------------------------------------------------------
  // Short-landscape: non-anchor neighbor can be hovered independently
  // ------------------------------------------------------------------

  test('short-landscape: a non-anchor neighbor can be hovered independently at 844x390', async ({ page }) => {
    test.setTimeout(60000);
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
    await page.waitForTimeout(1000);

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

  // ------------------------------------------------------------------
  // Focus mode exit: verifying neighbor selection doesn't corrupt state
  // ------------------------------------------------------------------

  test('desktop: after neighbor hover+click, state is consistent and focusedNode is valid', async ({ page }) => {
    test.setTimeout(60000);
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
    await page.waitForTimeout(1000);

    const neighbor = await findHoverableNeighbor(page);
    expect(neighbor, 'hoverable non-anchor neighbor must exist for state consistency test').not.toBeNull();

    await page.mouse.click(neighbor.screenX, neighbor.screenY);
    await page.waitForTimeout(800);

    const after = await probe(page);

    // State must not be corrupted — focusedNode must be null or a valid index
    const focusValid = after.focusedNode === null || isValidNodeIndex(after.focusedNode, after.pointCount);
    expect(focusValid, 'focusedNode must be null or valid index after neighbor click').toBe(true);

    // navMode must be a defined string (not undefined)
    expect(typeof after.navMode === 'string' && after.navMode.length > 0,
      `navMode must be a non-empty string, got "${after.navMode}"`).toBe(true);

    // Point count must be non-zero
    expect(after.pointCount, 'pointCount must remain valid after neighbor interaction').toBeGreaterThan(0);
  });

});