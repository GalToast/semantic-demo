/**
 * 3d-focus-ghost-graph-visibility.spec.js
 *
 * Whole-graph / context point cloud visibility during focus mode.
 *
 * Confirms that graph nodes outside the focus pocket:
 *  1. Remain spatially present (projected to finite screen coordinates)
 *  2. Are collectively visible as a traversal context layer
 *  3. Are distinguished from pocket nodes (which use the large spore mesh)
 *
 * Success criteria
 * ───────────────
 *  1. In focus mode, pointsMaterial.opacity ≈ base scene opacity * 0.24
 *  2. In focus mode, pointsMaterial.size is reduced but still legible (scaled by 0.62)
 *  3. Out-of-pocket nodes project to finite in-canvas screen coordinates
 *  4. Out-of-pocket nodes are NOT in focusPocketIndices
 *  5. Node spore meshes (larger) are distinct from point cloud (smaller) — visual layering confirmed
 *  6. Semantic-dive (trailDepth ≥ 2) keeps a quieter context layer visible
 *
 * Desktop (1440×900) and short-landscape (844×390) are both covered.
 *
 * Run via:
 *   npx playwright test tests/3d-focus-ghost-graph-visibility.spec.js --browser=chromium
 * Or via manifest — group: 3d-focus-ghost-graph-visibility
 */

import { test, expect } from '@playwright/test';
import {
  BASE_URL, setupMockSearch, openApp,
  probe, probeFocusPocket, isReachableScreenCoordinate, focusNodeViaApp
} from './helpers/3d-interaction-helpers.js';

const FOCUS_GHOST_TIMEOUT_MS = 120000;
const POINTS_MATERIAL_BASE_OPACITY = 0.82; // from state.js
const SCENE_POINT_OPACITY_SCALE = 0.82; // from SCENE_ATMOSPHERE.pointOpacityScale
const FOCUS_CONTEXT_OPACITY_SCALE = 0.24;
const SEMANTIC_DIVE_CONTEXT_OPACITY_SCALE = 0.16;
const FOCUS_CONTEXT_SIZE_SCALE = 0.62;
const SEMANTIC_DIVE_CONTEXT_SIZE_SCALE = 0.52;
const POINTS_MATERIAL_BASE_SIZE = 0.0175;

// ─── Probe: full-graph projected nodes (outside focus pocket) ─────────────────

async function probeGhostGraph(page) {
  return page.evaluate(({ baseOpacity, sceneOpacityScale, focusOpacityScale }) => {
    const state = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {};
    const nav = state.navState || {};
    const camera = state.camera;
    const canvas = state.renderer?.domElement;
    const rect = canvas?.getBoundingClientRect?.();
    const nodePositions = state.nodePositions || [];
    const pointsMesh = state.pointsMesh;
    const pocketSet = new Set(nav.focusPocketIndices || []);
    const focusedIdx = nav.focusedIndex;

    // Always include the anchor in the pocket set for out-of-pocket checks
    if (Number.isFinite(focusedIdx)) pocketSet.add(focusedIdx);

    // Sample every 8th node to keep the readback bounded
    const step = Math.max(1, Math.floor(nodePositions.length / 80));
    const outOfPocketProjected = [];
    const inCanvasProjected = [];

    for (let i = 0; i < nodePositions.length; i += step) {
      if (pocketSet.has(i)) continue; // skip pocket nodes
      const pos = nodePositions[i];
      if (!pos || !camera || !rect) continue;
      const vec = new window.THREE.Vector3(pos.x, pos.y, pos.z);
      if (pointsMesh?.localToWorld) pointsMesh.localToWorld(vec);
      const proj = vec.clone().project(camera);
      if (proj.z < -1 || proj.z > 1) continue;
      const screenX = ((proj.x + 1) / 2) * rect.width + rect.left;
      const screenY = ((-proj.y + 1) / 2) * rect.height + rect.top;
      const inBounds = screenX >= rect.left && screenX <= rect.right &&
                       screenY >= rect.top  && screenY <= rect.bottom;
      const entry = { idx: i, screenX, screenY, inCanvas: inBounds, projZ: proj.z };
      outOfPocketProjected.push(entry);
      if (inBounds) inCanvasProjected.push(entry);
    }

    const pointsMaterial = state.pointsMaterial || {};
    const pointsMesh_ = state.pointsMesh;

    return {
      mode: nav.mode || '',
      trailDepth: nav.trailDepth ?? null,
      focusedIndex: focusedIdx,
      pocketSize: (nav.focusPocketIndices || []).length,
      pocketIndices: nav.focusPocketIndices || [],
      outOfPocketSampled: outOfPocketProjected.length,
      outOfPocketInCanvasCount: inCanvasProjected.length,
      // Sample first 6 in-canvas out-of-pocket nodes for reachability
      outOfPocketInCanvasSample: inCanvasProjected.slice(0, 6),
      pointsMaterialOpacity: pointsMaterial.opacity ?? null,
      pointsMaterialSize: pointsMaterial.size ?? null,
      pointsMaterialBaseOpacity: baseOpacity,
      expectedOpacity: baseOpacity * sceneOpacityScale * focusOpacityScale,
      pointsMeshVisible: pointsMesh_?.visible ?? null,
      nodeSporeMeshVisible: state.nodeSporeMesh?.visible ?? null,
      nodeSporeMeshCount: state.nodeSporeMesh?.count ?? 0,
    };
  }, {
    baseOpacity: POINTS_MATERIAL_BASE_OPACITY,
    sceneOpacityScale: SCENE_POINT_OPACITY_SCALE,
    focusOpacityScale: FOCUS_CONTEXT_OPACITY_SCALE
  });
}

// ─── Probe: pointsMaterial opacity and size scale ─────────────────────────────

async function probePointsMaterialFocusState(page) {
  return page.evaluate((config) => {
    const state = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {};
    const pm = state.pointsMaterial || {};
    const pointsMesh = state.pointsMesh;
    const isFocused = Number.isFinite(state.focusedNode);
    const trailDepth = state.trailDepth ?? 0; // top-level state, not navState sub-property
    // Focus preserves enough graph context for direct traversal.
    const expectedOpacity = isFocused
      ? config.baseOpacity * config.sceneOpacityScale * (trailDepth >= 2 ? config.semanticDiveOpacityScale : config.focusOpacityScale)
      : config.baseOpacity * config.sceneOpacityScale;

    const expectedSize = isFocused
      ? config.baseSize * 1.52 * (trailDepth >= 2 ? config.semanticDiveSizeScale : config.focusSizeScale)
      : config.baseSize * 1.52;

    return {
      isFocused,
      trailDepth,
      currentOpacity: pm.opacity ?? null,
      currentSize: pm.size ?? null,
      expectedOpacity,
      expectedSize,
      pointsMeshVisible: pointsMesh?.visible ?? null,
      nodeSporeMeshVisible: state.nodeSporeMesh?.visible ?? null,
    };
  }, {
    baseOpacity: POINTS_MATERIAL_BASE_OPACITY,
    sceneOpacityScale: SCENE_POINT_OPACITY_SCALE,
    focusOpacityScale: FOCUS_CONTEXT_OPACITY_SCALE,
    semanticDiveOpacityScale: SEMANTIC_DIVE_CONTEXT_OPACITY_SCALE,
    focusSizeScale: FOCUS_CONTEXT_SIZE_SCALE,
    semanticDiveSizeScale: SEMANTIC_DIVE_CONTEXT_SIZE_SCALE,
    baseSize: POINTS_MATERIAL_BASE_SIZE
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function opacityErrorPercent(current, expected) {
  if (!Number.isFinite(current) || !Number.isFinite(expected) || expected === 0) return Infinity;
  return Math.abs(current - expected) / expected * 100;
}

test.describe('3d-focus-ghost-graph-visibility', () => {

  // ── Material opacity ────────────────────────────────────────────────────────

  test('desktop: whole-graph point cloud remains legible during focus mode', async ({ page }) => {
    test.setTimeout(FOCUS_GHOST_TIMEOUT_MS);
    await openApp(page, { width: 1440, height: 900 });

    const entryIndex = await page.evaluate(() => {
      const pts = (window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}).points;
      if (!pts || pts.length === 0) return 0;
      for (let i = 0; i < Math.min(pts.length, 30); i++) {
        const state = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {};
        const node = state.semanticNeighborMapByLeadId?.get(pts[i]?.lead_id);
        if (node?.neighbors?.length > 0) return i;
      }
      return 0;
    });

    await focusNodeViaApp(page, entryIndex);
    await page.waitForFunction(() => Number.isFinite((window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}).focusedNode), { timeout: 15000 });
    await page.waitForTimeout(800);

    const snap = await probePointsMaterialFocusState(page);

    expect(snap.isFocused, 'must be in focused state').toBe(true);
    expect(snap.currentOpacity, 'pointsMaterial.opacity must be set').not.toBeNull();

    const TOLERANCE_PCT = 20; // allow 20% drift from target
    const err = opacityErrorPercent(snap.currentOpacity, snap.expectedOpacity);
    expect(err < TOLERANCE_PCT,
      `pointsMaterial opacity (${snap.currentOpacity.toFixed(4)}) should be ≈ ${snap.expectedOpacity.toFixed(4)} (within ${TOLERANCE_PCT}%); got ${err.toFixed(1)}% error`
    ).toBe(true);
  });

  test('desktop: whole-graph point cloud remains visible in semantic-dive mode', async ({ page }) => {
    test.setTimeout(FOCUS_GHOST_TIMEOUT_MS);
    await openApp(page, { width: 1440, height: 900 });

    // Enter semantic-dive directly: dive twice on a node with neighbors
    const entryIndex = await page.evaluate(() => {
      const pts = (window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}).points;
      if (!pts || pts.length === 0) return 0;
      for (let i = 0; i < Math.min(pts.length, 30); i++) {
        const state = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {};
        const node = state.semanticNeighborMapByLeadId?.get(pts[i]?.lead_id);
        if (node?.neighbors?.length > 0) return i;
      }
      return 0;
    });

    await focusNodeViaApp(page, entryIndex);
    await page.waitForFunction(() => Number.isFinite((window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}).focusedNode), { timeout: 15000 });
    await page.waitForTimeout(500);

    const afterFocus = await probePointsMaterialFocusState(page);
    expect(afterFocus.trailDepth, 'focus mode starts at ghost depth').toBe(1);

    // Step Inside: production path sets trailDepth=2 with the required gesture gate.
    await page.evaluate(() => { window.__APP_ACTIONS__.setSemanticDiveMode(true); });
    await page.waitForFunction(
      () => (window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}).trailDepth === 2 && (window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}).semanticDiveMode === true,
      { timeout: 15000 }
    );
    await page.waitForTimeout(800);
    const afterDive2 = await probePointsMaterialFocusState(page);
    expect(afterDive2.trailDepth, 'after second dive trailDepth should be 2').toBe(2);
    expect(afterDive2.currentOpacity, 'currentOpacity must be set').not.toBeNull();
    expect(afterDive2.pointsMeshVisible, 'point cloud remains available in semantic-dive').toBe(true);
    expect(afterDive2.currentOpacity, 'point cloud remains visible but quieter in semantic-dive').toBeGreaterThan(0.08);
    expect(afterDive2.currentOpacity, 'semantic-dive context should stay below focus context').toBeLessThan(0.14);
  });

  // ── Projected presence of out-of-pocket nodes ───────────────────────────────

  test('desktop: out-of-pocket nodes have finite in-canvas screen coordinates during focus mode', async ({ page }) => {
    test.setTimeout(FOCUS_GHOST_TIMEOUT_MS);
    await openApp(page, { width: 1440, height: 900 });

    const entryIndex = await page.evaluate(() => {
      const pts = (window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}).points;
      if (!pts || pts.length === 0) return 0;
      for (let i = 0; i < Math.min(pts.length, 30); i++) {
        const state = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {};
        const node = state.semanticNeighborMapByLeadId?.get(pts[i]?.lead_id);
        if (node?.neighbors?.length > 0) return i;
      }
      return 0;
    });

    await focusNodeViaApp(page, entryIndex);
    await page.waitForFunction(() => Number.isFinite((window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}).focusedNode), { timeout: 15000 });
    await page.waitForTimeout(800);

    const snap = await probeGhostGraph(page);

    expect(['focus', 'trail'], 'focused traversal should be in focus/trail mode').toContain(snap.mode);
    expect(snap.pocketSize, 'pocket must have at least 1 node').toBeGreaterThan(0);
    expect(snap.outOfPocketSampled, 'must have sampled out-of-pocket nodes').toBeGreaterThan(0);
    expect(snap.outOfPocketInCanvasCount, 'at least some out-of-pocket nodes must project into the canvas').toBeGreaterThan(0);

    // All sampled out-of-pocket nodes that are in canvas must have finite coordinates
    for (const node of snap.outOfPocketInCanvasSample) {
      expect(Number.isFinite(node.screenX), `out-of-pocket idx=${node.idx} screenX must be finite`).toBe(true);
      expect(Number.isFinite(node.screenY), `out-of-pocket idx=${node.idx} screenY must be finite`).toBe(true);
      expect(node.inCanvas, `out-of-pocket idx=${node.idx} must be in canvas`).toBe(true);
    }
  });

  test('desktop: out-of-pocket in-canvas nodes are reachable (not blocked by overlays)', async ({ page }) => {
    test.setTimeout(FOCUS_GHOST_TIMEOUT_MS);
    await openApp(page, { width: 1440, height: 900 });

    const entryIndex = await page.evaluate(() => {
      const pts = (window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}).points;
      if (!pts || pts.length === 0) return 0;
      for (let i = 0; i < Math.min(pts.length, 30); i++) {
        const state = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {};
        const node = state.semanticNeighborMapByLeadId?.get(pts[i]?.lead_id);
        if (node?.neighbors?.length > 0) return i;
      }
      return 0;
    });

    await focusNodeViaApp(page, entryIndex);
    await page.waitForFunction(() => Number.isFinite((window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}).focusedNode), { timeout: 15000 });
    await page.waitForTimeout(800);

    const snap = await probeGhostGraph(page);

    expect(snap.outOfPocketInCanvasSample.length, 'must have in-canvas sample to check').toBeGreaterThan(0);

    let reachableCount = 0;
    for (const node of snap.outOfPocketInCanvasSample) {
      const reachable = await isReachableScreenCoordinate(page, node.screenX, node.screenY);
      if (reachable) reachableCount++;
    }

    // At least one out-of-pocket node must be reachable
    expect(reachableCount, `at least one out-of-pocket ghost node must be canvas-reachable; got ${reachableCount}/${snap.outOfPocketInCanvasSample.length}`).toBeGreaterThan(0);
  });

  // ── Spore mesh vs point cloud layering ───────────────────────────────────

  test('desktop: node spore mesh is visible and distinct from the point cloud during focus', async ({ page }) => {
    test.setTimeout(FOCUS_GHOST_TIMEOUT_MS);
    await openApp(page, { width: 1440, height: 900 });

    const entryIndex = await page.evaluate(() => {
      const pts = (window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}).points;
      if (!pts || pts.length === 0) return 0;
      for (let i = 0; i < Math.min(pts.length, 30); i++) {
        const state = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {};
        const node = state.semanticNeighborMapByLeadId?.get(pts[i]?.lead_id);
        if (node?.neighbors?.length > 0) return i;
      }
      return 0;
    });

    await focusNodeViaApp(page, entryIndex);
    await page.waitForFunction(() => Number.isFinite((window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}).focusedNode), { timeout: 15000 });
    await page.waitForTimeout(800);

    const snap = await probeGhostGraph(page);

    // Node spore mesh must be visible (pocket nodes use this, not the point cloud)
    expect(snap.nodeSporeMeshVisible, 'nodeSporeMesh must be visible during focus').toBe(true);
    expect(snap.nodeSporeMeshCount, 'nodeSporeMesh must have instance count').toBeGreaterThan(0);

    // Points mesh must also be visible (ghost layer)
    expect(snap.pointsMeshVisible, 'pointsMesh must be visible (ghost layer) during focus').toBe(true);

    // Size difference: spore instances are much larger than pointsMaterial points
    // This is structural — spore mesh uses spore geometry (~NODE_SPORE_BASE_RADIUS * emphasis)
    // while pointsMaterial uses POINTS_MATERIAL_BASE_SIZE — they serve different visual roles
    expect(snap.pointsMaterialSize, 'pointsMaterial.size must be set').not.toBeNull();
    expect(snap.pointsMaterialSize, 'pointsMaterial.size should be smaller in focus mode').toBeLessThan(0.08);
  });

  // ── Short-landscape ─────────────────────────────────────────────────────

  test('short-landscape: ghost graph is present and in-canvas at 844×390', async ({ page }) => {
    test.setTimeout(FOCUS_GHOST_TIMEOUT_MS);
    await openApp(page, { width: 844, height: 390 });

    const entryIndex = await page.evaluate(() => {
      const pts = (window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}).points;
      if (!pts || pts.length === 0) return 0;
      for (let i = 0; i < Math.min(pts.length, 30); i++) {
        const state = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {};
        const node = state.semanticNeighborMapByLeadId?.get(pts[i]?.lead_id);
        if (node?.neighbors?.length > 0) return i;
      }
      return 0;
    });

    await focusNodeViaApp(page, entryIndex);
    await page.waitForFunction(() => Number.isFinite((window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}).focusedNode), { timeout: 15000 });
    await page.waitForTimeout(800);

    const snap = await probeGhostGraph(page);

    expect(['focus', 'trail'], 'short-landscape focused traversal should be in focus/trail mode').toContain(snap.mode);
    expect(snap.pocketSize, 'pocket must have at least 1 node at short-landscape').toBeGreaterThan(0);
    expect(snap.outOfPocketInCanvasCount, 'at least some out-of-pocket nodes must be in canvas at short-landscape').toBeGreaterThan(0);

    // Context opacity still applies at short-landscape
    const err = opacityErrorPercent(snap.pointsMaterialOpacity, snap.expectedOpacity || 0);
    expect(err < 30, // looser tolerance for smaller viewport
      `short-landscape: pointsMaterial opacity (${snap.pointsMaterialOpacity?.toFixed(4)}) should be ≈ ${(snap.expectedOpacity || 0).toFixed(4)}`
    ).toBe(true);
  });

  test('short-landscape: pointsMaterial.size is reduced in focus mode (smaller ghost points)', async ({ page }) => {
    test.setTimeout(FOCUS_GHOST_TIMEOUT_MS);
    await openApp(page, { width: 844, height: 390 });

    const entryIndex = await page.evaluate(() => {
      const pts = (window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}).points;
      if (!pts || pts.length === 0) return 0;
      for (let i = 0; i < Math.min(pts.length, 30); i++) {
        const state = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {};
        const node = state.semanticNeighborMapByLeadId?.get(pts[i]?.lead_id);
        if (node?.neighbors?.length > 0) return i;
      }
      return 0;
    });

    await focusNodeViaApp(page, entryIndex);
    await page.waitForFunction(() => Number.isFinite((window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}).focusedNode), { timeout: 15000 });
    await page.waitForTimeout(800);

    const snap = await probePointsMaterialFocusState(page);

    expect(snap.isFocused, 'short-landscape must be in focused state').toBe(true);
    expect(snap.currentSize, 'pointsMaterial.size must be set').not.toBeNull();
    // In focus mode, point size is reduced but remains large enough to read as graph context.
    expect(snap.currentSize, 'short-landscape pointsMaterial.size must be reduced in focus mode').toBeLessThan(0.04);
  });

});
