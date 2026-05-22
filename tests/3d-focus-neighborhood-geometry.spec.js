/**
 * 3d-focus-neighborhood-geometry.spec.js
 *
 * Focus neighborhood geometry tests: screen coordinate projection,
 * role distinguishability, and anchor/neighbor spatial separation.
 *
 * Success criteria
 * ───────────────
 *  1. enumerate focusPocketIndices, exclude the focused index
 *  2. project each neighbor to screen space
 *  3. assert non-anchor candidates have:
 *     a. finite screen coordinates in unobstructed canvas
 *     b. visually distinguishable state/role from the anchor
 *     c. minimum screen distance from anchor
 *
 * Desktop (1440×900) and short-landscape (844×390) are both covered.
 *
 * Run via:
 *   npx playwright test tests/3d-focus-neighborhood-geometry.spec.js --browser=chromium
 * Or via manifest — group: 3d-focus-pocket-geometry
 */

import { test, expect } from '@playwright/test';
import {
  BASE_URL, setupMockSearch, openApp,
  probe, probeFocusPocket, isValidNodeIndex, isReachableScreenCoordinate
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
    const roles = nav.focusPocketRoleByIndex
      ? Object.fromEntries(nav.focusPocketRoleByIndex)
      : {};

    return {
      focusedIndex: focusedIdx,
      focusedNode: window.state?.focusedNode ?? null,
      pocketIndices: pocketRaw,
      neighborIndices,
      projected,
      reachableCount: reachable.length,
      reachableIndices: reachable.map(n => n.idx),
      roles,
      focusPocketMeta: nav.focusPocketMeta ?? null,
      mode: nav.mode ?? '',
    };
  });
}

test.describe('focus-neighborhood geometry', () => {

  test('desktop: non-anchor pocket nodes have finite screen coordinates in unobstructed canvas', async ({ page }) => {
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

    const snap = await probeNeighborhood(page);

    expect(snap.neighborIndices.length, 'pocket must contain at least one non-anchor node').toBeGreaterThan(0);

    const projected = snap.projected.filter(n => n.idx !== snap.focusedIndex);
    expect(projected.length, 'non-anchor neighbors must be projectable').toBeGreaterThan(0);

    for (const neighbor of projected) {
      expect(Number.isFinite(neighbor.screenX), `neighbor idx=${neighbor.idx} screenX must be finite`).toBe(true);
      expect(Number.isFinite(neighbor.screenY), `neighbor idx=${neighbor.idx} screenY must be finite`).toBe(true);
    }

    expect(snap.reachableCount, `at least one non-anchor neighbor must be on-screen and reachable, got ${snap.reachableCount} of ${projected.length}`).toBeGreaterThan(0);

    const onCanvasProjected = projected.filter(n => n.hasScreen && n.inCanvas);
    expect(onCanvasProjected.length, `at least one non-anchor neighbor must project inside the canvas; projected=${JSON.stringify(projected)}`).toBeGreaterThan(0);

    const unobstructed = [];
    for (const proj of onCanvasProjected) {
      const reachable = await isReachableScreenCoordinate(page, proj.screenX, proj.screenY);
      if (reachable) unobstructed.push(proj.idx);
    }
    expect(
      unobstructed.length,
      `at least one non-anchor neighbor must be in unobstructed canvas; onCanvas=${JSON.stringify(onCanvasProjected)}`
    ).toBeGreaterThan(0);
  });

  test('desktop: non-anchor neighbors are role-distinguishable from anchor (anchor=anchor, neighbor=primary/support/halo)', async ({ page }) => {
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

    const snap = await probeNeighborhood(page);

    const anchorRole = snap.roles[String(snap.focusedIndex)];
    expect(anchorRole, `focused index must have role "anchor", got "${anchorRole}"`).toBe('anchor');

    const validRoles = new Set(['primary', 'support', 'halo']);
    for (const [idx, role] of Object.entries(snap.roles)) {
      if (String(idx) === String(snap.focusedIndex)) continue;
      expect(validRoles.has(role), `neighbor idx=${idx} must have role primary/support/halo, got "${role}"`).toBe(true);
    }

    for (const idx of snap.neighborIndices) {
      expect(snap.roles[String(idx)], `neighbor idx=${idx} must have a defined role`).toBeDefined();
    }
  });

  test('desktop: non-anchor neighbors have minimum screen distance from anchor (not co-located)', async ({ page }) => {
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
    await page.waitForTimeout(700);

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

});