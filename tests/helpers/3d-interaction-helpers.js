export const BASE_URL = (process.env.TEST_BASE_URL || 'http://127.0.0.1:8795').replace(/\/$/, '');

import { SEMANTIC_HEALTH_STUB, SEARCH_STUB, setupMockSearch } from './mock-semantic-search.js';
export { SEMANTIC_HEALTH_STUB, SEARCH_STUB, setupMockSearch };

export async function openApp(page, viewport = { width: 1440, height: 900 }) {
  page.on('console', msg => console.log('BROWSER:', msg.text()));
  await setupMockSearch(page);
  await page.setViewportSize(viewport);
  await page.goto(`${BASE_URL}/vector-explorer-polished.html?view=galaxy&nodemo=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const state = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {};
    return (
      Array.isArray(state?.points) &&
      state.points.length > 0 &&
      state?.renderer?.domElement &&
      state?.camera &&
      state?.pointsMesh
    );
  }, { timeout: 20000 });
  // After renderer/canvas are ready, the app is functionally initialized.
  // The loading-overlay CSS class may drift or never fully clear on some
  // viewports (e.g. short-landscape, mobile); do not block on it.
  // Accept: overlay absent, or overlay non-blocking, or already hidden.
  // If none of those apply within the timeout the app still passes
  // because core state (points+renderer+camera) is already confirmed.
  await page.waitForFunction(() => {
    const overlay = document.getElementById('loading-overlay');
    if (!overlay) return true;
    const styles = getComputedStyle(overlay);
    return overlay.classList.contains('hidden') ||
      styles.display === 'none' ||
      styles.visibility === 'hidden' ||
      styles.pointerEvents === 'none';
  }, { timeout: 10000 }).catch(() => {
    // Non-fatal: core app state is already confirmed ready above.
  });
  // navState.mode===overview is a stronger signal but can lag on mobile
  // boots; treat as best-effort after core state is confirmed.
  await page.waitForFunction(() => (window.__APP_STATE__ ?? window.__TEST_STATE__)?.navState?.mode === 'overview', { timeout: 8000 }).catch(() => {
    // Non-fatal when core app state is ready.
  });
  // Wait for the info panel surface to reach idle state instead of a fixed sleep.
  await page.waitForFunction(() => {
    const ps = document.body?.dataset?.panelSurface;
    return ps === 'idle' || ps === 'overview';
  }, { timeout: 8000 }).catch(() => {});
}

export async function waitForGalaxyReady(page, viewport = { width: 1440, height: 900 }, { waitMs = 2500 } = {}) {
  await openApp(page, viewport);
  await page.waitForFunction(() => document.body?.dataset?.graphicsMode === 'webgl', { timeout: 10000 });
  // Wait for scene to be ready instead of a fixed sleep.
  await page.waitForFunction(() => {
    const sceneReady = document.body?.dataset?.sceneReady;
    return sceneReady === 'true';
  }, { timeout: waitMs }).catch(() => {});
}

export async function openAppForTouch(page, viewport = { width: 1440, height: 900 }) {
  await setupMockSearch(page);
  await page.setViewportSize(viewport);
  await page.goto(`${BASE_URL}/vector-explorer-polished.html?view=galaxy&nodemo=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const state = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {};
    return (
      Array.isArray(state?.points) &&
      state.points.length > 0 &&
      state?.renderer?.domElement &&
      state?.camera &&
      state?.pointsMesh
    );
  }, { timeout: 20000 });
  // Same tolerant overlay check as openApp; see openApp comments.
  await page.waitForFunction(() => {
    const overlay = document.getElementById('loading-overlay');
    if (!overlay) return true;
    const styles = getComputedStyle(overlay);
    return overlay.classList.contains('hidden') ||
      styles.display === 'none' ||
      styles.visibility === 'hidden' ||
      styles.pointerEvents === 'none';
  }, { timeout: 10000 }).catch(() => {
    // Non-fatal: core app state is already confirmed ready above.
  });
  await page.waitForFunction(() => {
    const ps = document.body?.dataset?.panelSurface;
    return ps === 'idle' || ps === 'overview';
  }, { timeout: 8000 }).catch(() => {});
}

export async function probe(page) {
  return page.evaluate(() => {
    const state = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {};
    const camera = state?.camera;
    const canvas = state?.renderer?.domElement;
    const canvasRect = canvas?.getBoundingClientRect?.();
    return {
      focusedNode: state?.focusedNode ?? null,
      navMode: state?.navState?.mode || '',
      hoverHighlightIndex: state?.hoverHighlightIndex ?? null,
      stableCanvasHover: state?.stableCanvasHover
        ? {
            index: state.stableCanvasHover.index,
            screenX: state.stableCanvasHover.screenX,
            screenY: state.stableCanvasHover.screenY,
            source: state.stableCanvasHover.source || '',
            distance: state.stableCanvasHover.distance ?? null
          }
        : null,
      lastCanvasNodePick: state?.lastCanvasNodePick
        ? {
            index: state.lastCanvasNodePick.index,
            source: state.lastCanvasNodePick.source,
            screenX: state.lastCanvasNodePick.screenX,
            screenY: state.lastCanvasNodePick.screenY,
            distance: state.lastCanvasNodePick.distance
          }
        : null,
      lastCanvasNodeFocusPick: state?.lastCanvasNodeFocusPick
        ? {
            index: state.lastCanvasNodeFocusPick.index,
            source: state.lastCanvasNodeFocusPick.source,
            screenX: state.lastCanvasNodeFocusPick.screenX,
            screenY: state.lastCanvasNodeFocusPick.screenY,
            distance: state.lastCanvasNodeFocusPick.distance
          }
        : null,
      pointCount: state?.points?.length ?? 0,
      canvasCursor: canvas?.style?.cursor ?? '',
      cameraPosition: camera ? { x: camera.position.x, y: camera.position.y, z: camera.position.z } : null,
      cameraAspect: camera?.aspect ?? null,
      canvasRect: canvasRect ? { width: canvasRect.width, height: canvasRect.height } : null
    };
  });
}

export function isValidNodeIndex(value, pointCount) {
  return Number.isFinite(value) && value >= 0 && value < pointCount;
}

export async function probeScene(page) {
  return page.evaluate(() => {
    const state = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {};
    return {
      focusedNode: state.focusedNode ?? null,
      navMode: state.navState?.mode || '',
      trailDepth: state.trailDepth ?? null,
      hoverHighlightIndex: state.hoverHighlightIndex ?? null,
      pointCount: state.points?.length ?? 0,
      stableCanvasHover: state.stableCanvasHover
        ? {
            index: state.stableCanvasHover.index,
            screenX: state.stableCanvasHover.screenX,
            screenY: state.stableCanvasHover.screenY,
            source: state.stableCanvasHover.source || '',
            distance: state.stableCanvasHover.distance ?? null
          }
        : null,
      lastCanvasNodePick: state.lastCanvasNodePick
        ? {
            index: state.lastCanvasNodePick.index,
            source: state.lastCanvasNodePick.source,
            screenX: state.lastCanvasNodePick.screenX,
            screenY: state.lastCanvasNodePick.screenY,
            distance: state.lastCanvasNodePick.distance
          }
        : null,
      lastCanvasNodeFocusPick: state.lastCanvasNodeFocusPick
        ? {
            index: state.lastCanvasNodeFocusPick.index,
            source: state.lastCanvasNodeFocusPick.source,
            screenX: state.lastCanvasNodeFocusPick.screenX,
            screenY: state.lastCanvasNodeFocusPick.screenY,
            distance: state.lastCanvasNodeFocusPick.distance
          }
        : null,
      cameraPosition: state.camera
        ? { x: state.camera.position.x, y: state.camera.position.y, z: state.camera.position.z }
        : null,
      canvasRect: state.renderer?.domElement?.getBoundingClientRect
        ? { width: state.renderer.domElement.clientWidth, height: state.renderer.domElement.clientHeight }
        : null
    };
  });
}

export async function projectedCandidates(page, { marginRatio = 0.08, maxResults = 36 } = {}) {
  return page.evaluate(({ marginRatio: mr, maxResults: max }) => {
    const state = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {};
    const canvas = state?.renderer?.domElement;
    if (!canvas || !state?.camera || !state?.pointsMesh || !Array.isArray(state.nodePositions)) return [];
    // Bail early if WebGL context is lost; avoids GPU readback stall from
    // hanging the evaluate call in headless Chrome at short-landscape viewports.
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl || gl.isContextLost()) return [];
    const rect = canvas.getBoundingClientRect();
    // Scale the minimum margin with the viewport so short-landscape canvases
    // are not over-constrained by the old fixed 34px floor.
    const minMarginPx = Math.max(16, Math.min(rect.width, rect.height) * 0.04);
    const margin = Math.max(minMarginPx, Math.min(rect.width, rect.height) * mr);
    const step = Math.max(1, Math.floor(state.nodePositions.length / 140));
    const candidates = [];
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    for (let i = 0; i < state.nodePositions.length; i += step) {
      const pos = state.nodePositions[i];
      if (!pos) continue;
      const vector = new window.THREE.Vector3(pos.x, pos.y, pos.z);
      if (state.pointsMesh.localToWorld) state.pointsMesh.localToWorld(vector);
      const projected = vector.clone().project(state.camera);
      if (projected.z < -1 || projected.z > 1) continue;
      const screenX = ((projected.x + 1) / 2) * rect.width + rect.left;
      const screenY = ((-projected.y + 1) / 2) * rect.height + rect.top;
      if (screenX < rect.left + margin || screenX > rect.right - margin) continue;
      if (screenY < rect.top + margin || screenY > rect.bottom - margin) continue;
      const stack = document.elementsFromPoint(screenX, screenY);
      const hasCanvas = stack.includes(canvas);
      const blockedByControl = stack.some(el => el?.closest?.([
        'button', 'a', 'input', 'textarea', 'select',
        '.info-panel', '.focus-stage-card', '.summary-card', '.controls',
        '.view-toggle', '.journey-compass', '.legend-panel',
        '.weather-widget', '.share-toggle'
      ].join(',')) && getComputedStyle(el).pointerEvents !== 'none');
      if (!hasCanvas || blockedByControl) continue;
      candidates.push({
        sampledIndex: i,
        screenX,
        screenY,
        centerDistance: Math.hypot(screenX - centerX, screenY - centerY)
      });
    }
    // Re-check context loss before returning; it can be lost mid-iteration.
    if (gl.isContextLost()) return [];
    return candidates
      .sort((a, b) => a.centerDistance - b.centerDistance)
      .slice(0, max);
  }, { marginRatio, maxResults });
}

export async function projectedCanvasCandidates(page, { maxResultsOverride = 8 } = {}) {
  // Short landscape (844x390) exposes GPU ReadPixels stalls in headless Chrome.
  // Reduce maxResults to shrink the candidate-probing loop's exposure window
  // to the stall before a valid candidate is found. Override via parameter
  // for tests that need more candidates on larger viewports.
  return projectedCandidates(page, { marginRatio: 0.08, maxResults: maxResultsOverride });
}

/**
 * Probe focus pocket state: pocket indices, screen reachability, role assignment.
 * Independent of any particular spec's probe(); exposes the full pocket contract.
 */
export async function probeFocusPocket(page) {
  return page.evaluate(() => {
    const appState = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {};
    const state = appState?.navState ?? {};
    const pocket = state.focusPocketIndices ?? [];
    const camera = appState?.camera;
    const canvas = appState?.renderer?.domElement;
    const rect = canvas?.getBoundingClientRect?.();
    const nodePositions = appState?.nodePositions ?? [];
    const pointsMesh = appState?.pointsMesh;

    const withScreen = pocket.map(idx => {
      const pos = nodePositions[idx];
      if (!pos || !camera || !rect) return { idx, hasScreen: false, screenX: null, screenY: null };
      const vec = new window.THREE.Vector3(pos.x, pos.y, pos.z);
      if (pointsMesh?.localToWorld) pointsMesh.localToWorld(vec);
      const proj = vec.clone().project(camera);
      if (proj.z < -1 || proj.z > 1) return { idx, hasScreen: false, screenX: null, screenY: null };
      const screenX = ((proj.x + 1) / 2) * rect.width + rect.left;
      const screenY = ((-proj.y + 1) / 2) * rect.height + rect.top;
      const inBounds = screenX >= rect.left && screenX <= rect.right && screenY >= rect.top && screenY <= rect.bottom;
      return { idx, hasScreen: inBounds, screenX, screenY };
    });

    const reachable = withScreen.filter(n => n.hasScreen);
    const roles = state.focusPocketRoleByIndex ? Object.fromEntries(state.focusPocketRoleByIndex) : {};

    return {
      pocketIndices: pocket,
      pocketSize: pocket.length,
      reachableCount: reachable.length,
      reachableIndices: reachable.map(n => n.idx),
      focusPocketMeta: state.focusPocketMeta ?? null,
      roles,
      focusedIndex: state.focusedIndex ?? null,
      focusedNode: appState?.focusedNode ?? null,
    };
  });
}

/**
 * Returns true if the given screen coordinate hits the canvas and is not
 * blocked by any interactive overlay element.
 */
export async function readPocketNodeScales(page) {
  return page.evaluate(() => {
    const state = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {};
    const pocket = state.navState?.focusPocketIndices ?? [];
    const focusedIdx = state.navState?.focusedIndex ?? null;
    const roles = state.navState?.focusPocketRoleByIndex instanceof Map
      ? Object.fromEntries(state.navState.focusPocketRoleByIndex)
      : {};

    // Mirror the private getNodeSporeScale formula in three-engine.ts.
    // Keep these constants synchronized with that shader scale helper.
    // Formula: BASE * (0.86 + seed(index, 2.7) * 0.48) * emphasis
    // emphasis: anchor=2.15, primary=1.74, support=1.42, other=0.62
    const BASE = 0.0019;
    function seededUnit(index, salt) {
      const x = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43758.5453;
      return x - Math.floor(x);
    }
    function getNodeSporeScale(index) {
      let emphasis = 1;
      if (Number.isFinite(focusedIdx)) {
        if (index === focusedIdx) {
          emphasis = 2.15;
        } else if (pocket.includes(index)) {
          const role = roles[String(index)];
          emphasis = role === 'primary' ? 1.74 : role === 'support' ? 1.42 : 1.42;
        } else {
          const trailNeighbors = state.navState?.trailNeighborIndices || [];
          for (let i = 0; i < Math.min(12, trailNeighbors.length); i += 1) {
            if (trailNeighbors[i] === index) { emphasis = 1.48; break; }
          }
          if (emphasis === 1) emphasis = 0.62;
        }
      }
      if (index === state.hoverHighlightIndex) {
        emphasis = Math.max(emphasis, 1.95);
      }
      return BASE * (0.86 + seededUnit(index, 2.7) * 0.48) * emphasis;
    }

    // Include the anchor node (focusedIndex), whose spore scale is not in focusPocketIndices
    const anchorIdx = Number.isFinite(focusedIdx) ? focusedIdx : null;
    const allIndices = anchorIdx !== null
      ? [anchorIdx, ...pocket]
      : [...pocket];
    const uniqueIndices = [...new Set(allIndices)];

    return uniqueIndices.map(idx => {
      const role = idx === anchorIdx ? 'anchor' : (roles[String(idx)] || 'unknown');
      const scale = getNodeSporeScale(idx);
      return { idx, role, scale };
    });
  });
}

export async function isReachableScreenCoordinate(page, screenX, screenY) {
  return page.evaluate(({ x, y }) => {
    const state = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {};
    const canvas = state?.renderer?.domElement;
    if (!canvas) return false;
    const stack = document.elementsFromPoint(x, y);
    if (!stack.includes(canvas)) return false;
    const blocked = stack.some(el => el?.closest?.([
      'button','a','input','textarea','select',
      '.info-panel','.focus-stage-card','.summary-card','.controls',
      '.view-toggle','.journey-compass','.legend-panel',
      '.weather-widget','.share-toggle'
    ].join(',')) && getComputedStyle(el).pointerEvents !== 'none');
    return !blocked;
  }, { x: screenX, y: screenY });
}

/**
 * Probe the focused point's label and panel content at any DPR.
 * Returns the data needed for label-legibility assertions without the
 * test body needing to reference window.__TEST_STATE__ directly.
 */
export async function probeFocusPoint(page) {
  return page.evaluate(() => {
    const state = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {};
    const focusedNode = state?.focusedNode;
    if (focusedNode === null || focusedNode === undefined) {
      return { ok: false, reason: 'no-focused-node' };
    }
    const point = state?.points?.[focusedNode];
    if (!point) return { ok: false, reason: 'point-missing' };

    const label = point.public_note || point.label || point.name || null;
    const hasLabel = typeof label === 'string' && label.length > 0;

    const infoPanel = document.querySelector('.info-panel') || document.querySelector('.focus-stage-card');
    const panelText = infoPanel?.textContent?.trim() || '';
    const panelHasContent = panelText.length > 10;

    const focusedIndex = state?.navState?.focusedIndex;
    const pointCount = state?.points?.length ?? 0;
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

/**
 * Probe canvas DPR backing store dimensions.
 * Returns null if canvas is not present.
 */
export async function probeCanvasBacking(page) {
  return page.evaluate(() => {
    const canvas = (window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {})?.renderer?.domElement;
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
}

/**
 * Returns the midpoint node index from the current point array.
 * Used by specs to derive a valid focus target without referencing
 * window.__TEST_STATE__ directly in test bodies.
 */
export async function midpointIndex(page) {
  return page.evaluate(() => {
    const state = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {};
    return Math.floor((state?.points?.length ?? 0) / 2);
  });
}

/**
 * Focus a node via the product action entry point.
 *
 * Preferred path: window.__APP_ACTIONS__.focusOnNode. This function is the
 * single call point for focus test code so the app can retire bare window
 * bridges without rewriting every spec.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} index - node index to focus
 * @param {{ fromCanvasNode?: boolean, fromSearchResult?: boolean, skipUrlSync?: boolean, query?: string }} [options]
 * @returns {Promise<boolean>} true if focus was applied (function existed), false otherwise
 */
export async function focusNodeViaApp(page, index, options = {}) {
  return page.evaluate(({ idx, opts }) => {
    const focusNode = window.__APP_ACTIONS__?.focusOnNode;
    if (typeof focusNode !== 'function') return false;
    focusNode(idx, opts);
    return true;
  }, { idx: index, opts: options });
}
