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
  probe, probeFocusPocket, isValidNodeIndex, isReachableScreenCoordinate,
  readPocketNodeScales, focusNodeViaApp
} from './helpers/3d-interaction-helpers.js';

const FOCUS_NEIGHBORHOOD_TEST_TIMEOUT_MS = 120000;

async function probeNeighborhood(page) {
  return page.evaluate(() => {
    const state = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {};
    const nav = state.navState ?? {};
    const camera = state.camera;
    const canvas = state.renderer?.domElement;
    const rect = canvas?.getBoundingClientRect?.();
    const nodePositions = state.nodePositions ?? [];
    const pointsMesh = state.pointsMesh;
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
      focusedNode: state.focusedNode ?? null,
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
      const pts = (window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}).points;
      if (!pts || pts.length === 0) return 0;
      for (let i = 0; i < Math.min(pts.length, 30); i++) {
        const node = (window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}).semanticNeighborMapByLeadId?.get(pts[i]?.lead_id);
        if (node?.neighbors?.length > 0) return i;
      }
      return 0;
    });

    await focusNodeViaApp(page, entryIndex);
    await page.waitForFunction(() => ((window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}).navState?.mode === 'focus'), { timeout: 15000 });
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
      const pts = (window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}).points;
      if (!pts || pts.length === 0) return 0;
      for (let i = 0; i < Math.min(pts.length, 30); i++) {
        const node = (window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}).semanticNeighborMapByLeadId?.get(pts[i]?.lead_id);
        if (node?.neighbors?.length > 0) return i;
      }
      return 0;
    });

    await focusNodeViaApp(page, entryIndex);
    await page.waitForFunction(() => ((window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}).navState?.mode === 'focus'), { timeout: 15000 });
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
      const pts = (window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}).points;
      if (!pts || pts.length === 0) return 0;
      for (let i = 0; i < Math.min(pts.length, 30); i++) {
        const node = (window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}).semanticNeighborMapByLeadId?.get(pts[i]?.lead_id);
        if (node?.neighbors?.length > 0) return i;
      }
      return 0;
    });

    await focusNodeViaApp(page, entryIndex);
    await page.waitForFunction(() => ((window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}).navState?.mode === 'focus'), { timeout: 15000 });
    await page.waitForTimeout(700);

    const snap = await probeNeighborhood(page);
    // Minimum visible separation: desktop can afford a larger gap than short-landscape.
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

  // ---------------------------------------------------------------------------
  // Visual differentiation: spore scales differ by role
  // ---------------------------------------------------------------------------

  test('desktop: anchor/primary/support/halo pocket nodes have mathematically distinct spore scales', async ({ page }) => {
    test.setTimeout(FOCUS_NEIGHBORHOOD_TEST_TIMEOUT_MS);
    await openApp(page, { width: 1440, height: 900 });

    const entryIndex = await page.evaluate(() => {
      const pts = (window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}).points;
      if (!pts || pts.length === 0) return 0;
      for (let i = 0; i < Math.min(pts.length, 30); i++) {
        const node = (window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}).semanticNeighborMapByLeadId?.get(pts[i]?.lead_id);
        if (node?.neighbors?.length > 0) return i;
      }
      return 0;
    });

    await focusNodeViaApp(page, entryIndex);
    await page.waitForFunction(() => ((window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}).navState?.mode === 'focus'), { timeout: 15000 });
    await page.waitForTimeout(700);

    const snap = await probeNeighborhood(page);
    expect(snap.focusedIndex, 'focusedIndex must be set').not.toBeNull();

    const anchorRole = snap.roles[String(snap.focusedIndex)];
    expect(anchorRole, 'anchor must have role "anchor"').toBe('anchor');

    const scales = await readPocketNodeScales(page);
    expect(scales.length, 'pocket must have at least one node').toBeGreaterThan(0);

    // Build a map: role -> [scales]
    const scalesByRole = {};
    for (const s of scales) {
      if (!scalesByRole[s.role]) scalesByRole[s.role] = [];
      scalesByRole[s.role].push(s.scale);
    }

    // Assert we have at least two distinct scale values across roles
    const allScales = Object.values(scalesByRole).flat();
    const uniqueScales = [...new Set(allScales.map(s => s.toFixed(6)))];
    expect(uniqueScales.length, `pocket must expose at least 2 distinct scale values across roles; got ${uniqueScales.join(', ')}`).toBeGreaterThan(1);

    // Anchor (emphasis 2.15) must be the largest scale in the pocket
    const anchorScaleEntry = scales.find(s => s.idx === snap.focusedIndex);
    expect(anchorScaleEntry, 'anchor must have a scale entry').toBeDefined();
    for (const s of scales) {
      if (s.idx === snap.focusedIndex) continue;
      expect(
        anchorScaleEntry.scale > s.scale,
        `anchor scale (${anchorScaleEntry.scale.toFixed(6)}) must exceed neighbor scale (${s.scale.toFixed(6)}) for idx=${s.idx}`
      ).toBe(true);
    }

    // If we have primary and support/halo roles, primary (1.74) must be > support/halo (1.42)
    if (scalesByRole['primary'] && (scalesByRole['support'] || scalesByRole['halo'])) {
      const primaryMin = Math.min(...scalesByRole['primary']);
      const supportMax = Math.max(...(scalesByRole['support'] || []), ...(scalesByRole['halo'] || []));
      expect(primaryMin > supportMax,
        `primary scale (${primaryMin.toFixed(6)}) must be > support/halo scale (${supportMax.toFixed(6)})`
      ).toBe(true);
    }

    // All scales must be positive finite numbers
    for (const s of scales) {
      expect(Number.isFinite(s.scale) && s.scale > 0,
        `scale for idx=${s.idx} role=${s.role} must be positive finite, got ${s.scale}`
      ).toBe(true);
    }
  });

  test('tablet: non-anchor neighbors have minimum screen distance from anchor at 1024x768', async ({ page }) => {
    test.setTimeout(FOCUS_NEIGHBORHOOD_TEST_TIMEOUT_MS);
    await openApp(page, { width: 1024, height: 768 });

    const entryIndex = await page.evaluate(() => {
      const pts = (window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}).points;
      if (!pts || pts.length === 0) return 0;
      for (let i = 0; i < Math.min(pts.length, 30); i++) {
        const node = (window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}).semanticNeighborMapByLeadId?.get(pts[i]?.lead_id);
        if (node?.neighbors?.length > 0) return i;
      }
      return 0;
    });

    await focusNodeViaApp(page, entryIndex);
    await page.waitForFunction(() => ((window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}).navState?.mode === 'focus'), { timeout: 15000 });
    await page.waitForTimeout(700);

    const snap = await probeNeighborhood(page);
    const MIN_DISTANCE_PX = 22;

    expect(snap.neighborIndices.length, 'tablet pocket must have non-anchor nodes').toBeGreaterThan(0);

    const anchorProj = snap.projected.find(n => n.idx === snap.focusedIndex);
    expect(anchorProj, 'anchor must be projectable at tablet').toBeTruthy();
    expect(anchorProj.hasScreen, 'anchor must be on-screen at tablet').toBe(true);

    const nonAnchorProjected = snap.projected.filter(n => n.idx !== snap.focusedIndex && n.hasScreen);
    expect(nonAnchorProjected.length, 'tablet must have at least one non-anchor projected neighbor').toBeGreaterThan(0);

    let separatedCount = 0;
    for (const neighbor of nonAnchorProjected) {
      const dist = Math.hypot(neighbor.screenX - anchorProj.screenX, neighbor.screenY - anchorProj.screenY);
      if (dist >= MIN_DISTANCE_PX) separatedCount++;
    }
    expect(separatedCount, `tablet: at least one non-anchor neighbor must be ≥${MIN_DISTANCE_PX}px from anchor, got ${separatedCount}/${nonAnchorProjected.length}`).toBeGreaterThan(0);

    // Occlusion check: all on-screen projected neighbors must be in unobstructed canvas
    const onCanvasProjected = nonAnchorProjected.filter(n => n.inCanvas);
    const unobstructed = [];
    for (const proj of onCanvasProjected) {
      const reachable = await isReachableScreenCoordinate(page, proj.screenX, proj.screenY);
      if (reachable) unobstructed.push(proj.idx);
    }
    expect(unobstructed.length, `tablet: non-anchor neighbors must not be occluded by UI overlays; onCanvas=${onCanvasProjected.length}`).toBeGreaterThan(0);
  });

  test('mobile-portrait: non-anchor neighbors are visible and not occluded at 390x844', async ({ page }) => {
    test.setTimeout(FOCUS_NEIGHBORHOOD_TEST_TIMEOUT_MS);
    await openApp(page, { width: 390, height: 844 });

    const entryIndex = await page.evaluate(() => {
      const pts = (window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}).points;
      if (!pts || pts.length === 0) return 0;
      for (let i = 0; i < Math.min(pts.length, 30); i++) {
        const node = (window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}).semanticNeighborMapByLeadId?.get(pts[i]?.lead_id);
        if (node?.neighbors?.length > 0) return i;
      }
      return 0;
    });

    await focusNodeViaApp(page, entryIndex);
    await page.waitForFunction(() => ((window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}).navState?.mode === 'focus'), { timeout: 15000 });
    await page.waitForTimeout(700);

    const snap = await probeNeighborhood(page);

    expect(snap.neighborIndices.length, 'mobile-portrait pocket must have non-anchor nodes').toBeGreaterThan(0);

    const anchorProj = snap.projected.find(n => n.idx === snap.focusedIndex);
    expect(anchorProj?.hasScreen, 'anchor must be on-screen at mobile-portrait').toBe(true);

    const onScreen = snap.projected.filter(n => n.hasScreen && n.idx !== snap.focusedIndex);
    const inCanvas = snap.projected.filter(n => n.hasScreen && n.inCanvas && n.idx !== snap.focusedIndex);

    expect(onScreen.length, 'at least one non-anchor neighbor must be on-screen at mobile-portrait').toBeGreaterThan(0);

    const unobstructed = [];
    for (const proj of inCanvas) {
      const reachable = await isReachableScreenCoordinate(page, proj.screenX, proj.screenY);
      if (reachable) unobstructed.push(proj.idx);
    }
    expect(unobstructed.length, `mobile-portrait: non-anchor neighbors must not be occluded; onScreen=${onScreen.length}, inCanvas=${inCanvas.length}`).toBeGreaterThan(0);

    const MIN_DISTANCE_PX = 16;
    let separatedCount = 0;
    for (const neighbor of onScreen) {
      const dist = Math.hypot(neighbor.screenX - anchorProj.screenX, neighbor.screenY - anchorProj.screenY);
      if (dist >= MIN_DISTANCE_PX) separatedCount++;
    }
    expect(separatedCount, `mobile-portrait: at least one neighbor must be ≥${MIN_DISTANCE_PX}px from anchor`).toBeGreaterThan(0);
  });

  test('mobile-portrait: spore scale differentiation holds at 390x844', async ({ page }) => {
    test.setTimeout(FOCUS_NEIGHBORHOOD_TEST_TIMEOUT_MS);
    await openApp(page, { width: 390, height: 844 });

    const entryIndex = await page.evaluate(() => {
      const pts = (window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}).points;
      if (!pts || pts.length === 0) return 0;
      for (let i = 0; i < Math.min(pts.length, 30); i++) {
        const node = (window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}).semanticNeighborMapByLeadId?.get(pts[i]?.lead_id);
        if (node?.neighbors?.length > 0) return i;
      }
      return 0;
    });

    await focusNodeViaApp(page, entryIndex);
    await page.waitForFunction(() => ((window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}).navState?.mode === 'focus'), { timeout: 15000 });
    await page.waitForTimeout(700);

    const snap = await probeNeighborhood(page);
    expect(snap.focusedIndex, 'focusedIndex must be set at mobile-portrait').not.toBeNull();

    const scales = await readPocketNodeScales(page);
    expect(scales.length, 'mobile-portrait pocket must be non-empty').toBeGreaterThan(0);

    const anchorEntry = scales.find(s => s.idx === snap.focusedIndex);
    expect(anchorEntry, 'anchor must have scale entry at mobile-portrait').toBeDefined();

    // Anchor scale must be larger than every other pocket member
    for (const s of scales) {
      if (s.idx === snap.focusedIndex) continue;
      expect(anchorEntry.scale > s.scale,
        `mobile-portrait: anchor scale must exceed neighbor idx=${s.idx} scale`
      ).toBe(true);
    }

    // Distinct scale values must exist (proves differentiation is applied)
    const uniqueScales = [...new Set(scales.map(s => s.scale.toFixed(6)))];
    expect(uniqueScales.length, `mobile-portrait pocket must expose ≥2 distinct scales; got ${uniqueScales.length}`).toBeGreaterThan(1);
  });

  test('short-landscape: spore scale differentiation holds at 844x390', async ({ page }) => {
    test.setTimeout(FOCUS_NEIGHBORHOOD_TEST_TIMEOUT_MS);
    await openApp(page, { width: 844, height: 390 });

    const entryIndex = await page.evaluate(() => {
      const pts = (window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}).points;
      if (!pts || pts.length === 0) return 0;
      for (let i = 0; i < Math.min(pts.length, 30); i++) {
        const node = (window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}).semanticNeighborMapByLeadId?.get(pts[i]?.lead_id);
        if (node?.neighbors?.length > 0) return i;
      }
      return 0;
    });

    await focusNodeViaApp(page, entryIndex);
    await page.waitForFunction(() => ((window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}).navState?.mode === 'focus'), { timeout: 15000 });
    await page.waitForTimeout(700);

    const snap = await probeNeighborhood(page);
    expect(snap.focusedIndex, 'focusedIndex must be set at short-landscape').not.toBeNull();

    const scales = await readPocketNodeScales(page);
    expect(scales.length, 'pocket must be non-empty at short-landscape').toBeGreaterThan(0);

    const anchorEntry = scales.find(s => s.idx === snap.focusedIndex);
    expect(anchorEntry, 'anchor must have scale entry at short-landscape').toBeDefined();

    // Anchor scale must be larger than every other pocket member
    for (const s of scales) {
      if (s.idx === snap.focusedIndex) continue;
      expect(anchorEntry.scale > s.scale,
        `anchor scale must exceed neighbor idx=${s.idx} scale at short-landscape`
      ).toBe(true);
    }

    // Distinct scale values must exist (proves differentiation is applied)
    const uniqueScales = [...new Set(scales.map(s => s.scale.toFixed(6)))];
    expect(uniqueScales.length, `short-landscape pocket must expose ≥2 distinct scales; got ${uniqueScales.length}`).toBeGreaterThan(1);
  });

});
