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
    Array.isArray(window.state?.points) &&
    window.state.points.length > 0 &&
    window.state?.renderer?.domElement &&
    window.state?.camera &&
    window.state?.pointsMesh
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
  await page.waitForFunction(() => window.state?.navState?.mode === 'overview', { timeout: 10000 });
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
    Array.isArray(window.state?.points) &&
    window.state.points.length > 0 &&
    window.state?.renderer?.domElement &&
    window.state?.camera &&
    window.state?.pointsMesh
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
    const camera = window.state?.camera;
    const canvas = window.state?.renderer?.domElement;
    const canvasRect = canvas?.getBoundingClientRect?.();
    return {
      focusedNode: window.state?.focusedNode ?? null,
      navMode: window.state?.navState?.mode || '',
      hoverHighlightIndex: window.state?.hoverHighlightIndex ?? null,
      stableCanvasHover: window.state?.stableCanvasHover
        ? {
            index: window.state.stableCanvasHover.index,
            screenX: window.state.stableCanvasHover.screenX,
            screenY: window.state.stableCanvasHover.screenY,
            source: window.state.stableCanvasHover.source || '',
            distance: window.state.stableCanvasHover.distance ?? null
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
      pointCount: window.state?.points?.length ?? 0,
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
    const state = window.state || {};
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
    // Bail early if WebGL context is lost — avoids GPU readback stall from
    // hanging the evaluate call in headless Chrome at short-landscape viewports.
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl || gl.isContextLost()) return [];
    const rect = canvas.getBoundingClientRect();
    const margin = Math.max(34, Math.min(rect.width, rect.height) * mr);
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
    return candidates
      .sort((a, b) => a.centerDistance - b.centerDistance)
      .slice(0, max);
  }, { marginRatio, maxResults });
}

export async function projectedCanvasCandidates(page) {
  // Short landscape (844x390) exposes GPU ReadPixels stalls in headless Chrome.
  // Reduce maxResults from 14 to 8 to shrink the candidate-probing loop's
  // exposure window to the stall before a valid candidate is found.
  return projectedCandidates(page, { marginRatio: 0.08, maxResults: 8 });
}

/**
 * Probe focus pocket state: pocket indices, screen reachability, role assignment.
 * Independent of any particular spec's probe() — exposes the full pocket contract.
 */
export async function probeFocusPocket(page) {
  return page.evaluate(() => {
    const state = window.state?.navState ?? {};
    const pocket = state.focusPocketIndices ?? [];
    const camera = window.state?.camera;
    const canvas = window.state?.renderer?.domElement;
    const rect = canvas?.getBoundingClientRect?.();
    const nodePositions = window.state?.nodePositions ?? [];
    const pointsMesh = window.state?.pointsMesh;

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
      focusedNode: window.state?.focusedNode ?? null,
    };
  });
}

/**
 * Returns true if the given screen coordinate hits the canvas and is not
 * blocked by any interactive overlay element.
 */
export async function isReachableScreenCoordinate(page, screenX, screenY) {
  return page.evaluate(({ x, y }) => {
    const canvas = window.state?.renderer?.domElement;
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
