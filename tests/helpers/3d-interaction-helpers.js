export const BASE_URL = (process.env.TEST_BASE_URL || 'http://127.0.0.1:8795').replace(/\/$/, '');

export const SEMANTIC_HEALTH_STUB = {
  ok: true,
  state: 'healthy',
  provenance: { label: 'Search ready', detail: 'Semantic search is ready.' }
};

export const SEARCH_STUB = {
  ok: true,
  count: 3,
  results: [
    { lead_id: 1, score: 0.99, semantic_score: 0.99, public_note: 'Coffee shop on Main St.' },
    { lead_id: 2, score: 0.91, semantic_score: 0.91, public_note: 'Cafe near the park.' },
    { lead_id: 20, score: 0.86, semantic_score: 0.86, public_note: 'Espresso bar downtown.' }
  ]
};

export async function setupMockSearch(page) {
  await page.route('**/api.php?action=semantic_lane_health**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SEMANTIC_HEALTH_STUB) })
  );
  await page.route('**/api.php?action=semantic_search**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SEARCH_STUB) })
  );
}

export async function openApp(page, viewport = { width: 1440, height: 900 }) {
  await setupMockSearch(page);
  await page.setViewportSize(viewport);
  await page.goto(`${BASE_URL}/vector-explorer-polished.html?view=galaxy&nodemo=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => (
    typeof window.clearSearch === 'function' &&
    typeof window.focusOnNode === 'function' &&
    Array.isArray(window.__TEST_STATE__?.points) &&
    window.__TEST_STATE__.points.length > 0 &&
    window.__TEST_STATE__?.renderer?.domElement &&
    window.__TEST_STATE__?.camera &&
    window.__TEST_STATE__?.pointsMesh
  ), { timeout: 20000 });
  await page.waitForFunction(() => {
    const overlay = document.getElementById('loading-overlay');
    if (!overlay) return true;
    const styles = getComputedStyle(overlay);
    return overlay.classList.contains('hidden') ||
      styles.display === 'none' ||
      styles.visibility === 'hidden' ||
      styles.pointerEvents === 'none';
  }, { timeout: 20000 });
  await page.evaluate(() => {
    if (typeof window.returnToOverview === 'function') {
      window.returnToOverview();
    } else if (typeof window.resetExplorationFocus === 'function') {
      window.resetExplorationFocus();
    }
  });
  await page.waitForFunction(() => window.__TEST_STATE__?.navState?.mode === 'overview', { timeout: 10000 });
  await page.waitForTimeout(900);
}

export async function waitForGalaxyReady(page, viewport = { width: 1440, height: 900 }, { waitMs = 2500 } = {}) {
  await openApp(page, viewport);
  await page.waitForFunction(() => document.body?.dataset?.graphicsMode === 'webgl', { timeout: 10000 });
  await page.waitForTimeout(waitMs);
}

export async function openAppForTouch(page, viewport = { width: 1440, height: 900 }) {
  await setupMockSearch(page);
  await page.setViewportSize(viewport);
  await page.goto(`${BASE_URL}/vector-explorer-polished.html?view=galaxy&nodemo=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => (
    typeof window.clearSearch === 'function' &&
    typeof window.focusOnNode === 'function' &&
    Array.isArray(window.__TEST_STATE__?.points) &&
    window.__TEST_STATE__.points.length > 0 &&
    window.__TEST_STATE__?.renderer?.domElement &&
    window.__TEST_STATE__?.camera &&
    window.__TEST_STATE__?.pointsMesh
  ), { timeout: 20000 });
  await page.waitForFunction(() => {
    const overlay = document.getElementById('loading-overlay');
    if (!overlay) return true;
    const styles = getComputedStyle(overlay);
    return overlay.classList.contains('hidden') ||
      styles.display === 'none' ||
      styles.visibility === 'hidden' ||
      styles.pointerEvents === 'none';
  }, { timeout: 20000 });
  await page.waitForTimeout(900);
}

export async function probe(page) {
  return page.evaluate(() => {
    const camera = window.__TEST_STATE__?.camera;
    const canvas = window.__TEST_STATE__?.renderer?.domElement;
    const canvasRect = canvas?.getBoundingClientRect?.();
    return {
      focusedNode: window.__TEST_STATE__?.focusedNode ?? null,
      navMode: window.__TEST_STATE__?.navState?.mode || '',
      hoverHighlightIndex: window.__TEST_STATE__?.hoverHighlightIndex ?? null,
      stableCanvasHover: window.__TEST_STATE__?.stableCanvasHover
        ? {
            index: window.__TEST_STATE__.stableCanvasHover.index,
            screenX: window.__TEST_STATE__.stableCanvasHover.screenX,
            screenY: window.__TEST_STATE__.stableCanvasHover.screenY,
            source: window.__TEST_STATE__.stableCanvasHover.source || '',
            distance: window.__TEST_STATE__.stableCanvasHover.distance ?? null
          }
        : null,
      lastCanvasNodePick: window.__lastCanvasNodePick
        ? {
            index: window.__lastCanvasNodePick.index,
            source: window.__lastCanvasNodePick.source,
            screenX: window.__lastCanvasNodePick.screenX,
            screenY: window.__lastCanvasNodePick.screenY,
            distance: window.__lastCanvasNodePick.distance
          }
        : null,
      lastCanvasNodeFocusPick: window.__lastCanvasNodeFocusPick
        ? {
            index: window.__lastCanvasNodeFocusPick.index,
            source: window.__lastCanvasNodeFocusPick.source,
            screenX: window.__lastCanvasNodeFocusPick.screenX,
            screenY: window.__lastCanvasNodeFocusPick.screenY,
            distance: window.__lastCanvasNodeFocusPick.distance
          }
        : null,
      pointCount: window.__TEST_STATE__?.points?.length ?? 0,
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
    const state = window.__TEST_STATE__ || {};
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
      lastCanvasNodePick: window.__lastCanvasNodePick
        ? {
            index: window.__lastCanvasNodePick.index,
            source: window.__lastCanvasNodePick.source,
            screenX: window.__lastCanvasNodePick.screenX,
            screenY: window.__lastCanvasNodePick.screenY,
            distance: window.__lastCanvasNodePick.distance
          }
        : null,
      lastCanvasNodeFocusPick: window.__lastCanvasNodeFocusPick
        ? {
            index: window.__lastCanvasNodeFocusPick.index,
            source: window.__lastCanvasNodeFocusPick.source,
            screenX: window.__lastCanvasNodeFocusPick.screenX,
            screenY: window.__lastCanvasNodeFocusPick.screenY,
            distance: window.__lastCanvasNodeFocusPick.distance
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
    const { state } = window;
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
    const state = window.__TEST_STATE__?.navState ?? {};
    const pocket = state.focusPocketIndices ?? [];
    const camera = window.__TEST_STATE__?.camera;
    const canvas = window.__TEST_STATE__?.renderer?.domElement;
    const rect = canvas?.getBoundingClientRect?.();
    const nodePositions = window.__TEST_STATE__?.nodePositions ?? [];
    const pointsMesh = window.__TEST_STATE__?.pointsMesh;

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
      focusedNode: window.__TEST_STATE__?.focusedNode ?? null,
    };
  });
}

/**
 * Returns true if the given screen coordinate hits the canvas and is not
 * blocked by any interactive overlay element.
 */
export async function readPocketNodeScales(page) {
  return page.evaluate(() => {
    const state = window.__TEST_STATE__ || {};
    const pocket = state.navState?.focusPocketIndices ?? [];
    const focusedIdx = state.navState?.focusedIndex ?? null;
    const roles = state.navState?.focusPocketRoleByIndex instanceof Map
      ? Object.fromEntries(state.navState.focusPocketRoleByIndex)
      : {};

    // Mirror the private getNodeSporeScale formula in three-setup.js.
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
    const canvas = window.__TEST_STATE__?.renderer?.domElement;
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
